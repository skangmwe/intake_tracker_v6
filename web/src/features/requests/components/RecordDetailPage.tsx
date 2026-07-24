// S4 Record detail page (non-escalated). A single centered column: breadcrumb, header, a 4-field
// meta strip, a sticky lifecycle stepper, and a six-tab body. The Intake tab is this slice's core —
// live, data-driven field controls with debounced autosave; the other tabs are accessible stubs that
// land in later slices. The API returns 403 for both forbidden and non-existent records, so a 403 is
// rendered as a no-access surface, never a 404 (never discloses existence). See BS §17, S4.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowsLeftRight, CaretRight, CloudCheck } from '@phosphor-icons/react';

import type {
  FieldDefinitionDto,
  RecordId,
  RequestDto,
  RequestPatchRequest,
  SlaStatus,
  TimeInStage,
  WorkspaceId,
} from '@shared/types';

import { Button } from '@/shared/components/Button';
import { Select, TextArea } from '@/shared/components/Form';
import { Stepper, StatusPill, StatusHoldPill, Tabs } from '@/shared/components/Feedback';
import { NoAccessPage } from '@/shared/components/EdgeStates';
import { useHoldGuard } from '@/shared/hooks/useHoldGuard';
import { ApiError } from '@/shared/http/apiClient';
import { formatDate } from '@/shared/utils/dateFormat';
import { fetchWorkspaceFields } from '@/features/fields/api';
import { ActivityTab } from '@/features/comments';
import { TasksTab } from '@/features/tasks';
import { useMe } from '@/features/users/useMe';
import { EscalateModal, EscalatedIntakeNote } from '@/features/escalation';
import { AddToCatalogButton } from '@/features/features';
import {
  CloseRecordInline,
  CLOSE_OUTCOME_OPTIONS,
  type CloseOutcomeValue,
} from '@/features/closure';
import { RelationshipsCard } from '@/features/typed-links';
import { AttachmentsCard } from '@/features/attachments';
import { WatchersCard } from '@/features/watchers';
import { GenericRelatedRecordsTab, useRelationshipTabs } from '@/features/relationships';

import { RequestFieldControl } from './RequestFieldControl';
import { SlaBlock } from './SlaBlock';
import { formatSubmitted } from '../statusPresentation';
import { useRequest, usePatchRequest, useSetStage, useSetStatusHold } from '../useRequests';
import {
  computePriorityScore,
  evaluateFieldConditions,
  groupFieldsBySection,
  type FieldValueMap,
} from '../requestForm';
import { problemMessage } from '../problemMessage';
import '../recordDetail.css';

/** Autosave debounce — a field edit schedules one patch, coalescing rapid keystrokes. */
export const SAVE_DEBOUNCE_MS = 600;

type StatusKind = 'info' | 'success' | 'warning' | 'error' | 'neutral';

// Base tabs — always present on every Request record detail. Order matches the current S4/S5
// prototype. `tasks` is the system-seeded Request→Task relationship rendered by the specialised
// `TasksTab` (typed fields + bundle templates), not the GenericRelatedRecordsTab renderer.
// Non-system admin-authored relationships extend this list via useRelationshipTabs (Slice 25).
const BASE_TABS: { id: string; label: string }[] = [
  { id: 'status', label: 'Status' },
  { id: 'intake', label: 'Intake' },
  { id: 'tasks', label: 'Tasks & gates' },
  { id: 'attachments', label: 'Attachments' },
  { id: 'activity', label: 'Activity' },
  { id: 'watchers', label: 'Watchers & alerts' },
];

// The unified record-status picker (close/status cleanup). One control, two groups:
//   Active  — the working state (In progress / On hold), written via setStatusHold.
//   Closed  — a terminal Outcome; picking one reveals the inline Close-record panel (CloseRecordInline).
// 'Abandoned' was retired: dropping a record is now a Close · Withdrawn / Not pursued.
const STATUS_PICKER_GROUPS = [
  {
    label: 'Active',
    options: [
      { value: 'InProgress', label: 'In progress' },
      { value: 'OnHold', label: 'On hold' },
    ],
  },
  { label: 'Closed', options: CLOSE_OUTCOME_OPTIONS },
];

/** The Active-group values, written directly via setStatusHold. */
function isActiveStatus(value: string): value is 'InProgress' | 'OnHold' {
  return value === 'InProgress' || value === 'OnHold';
}

function displayStatusKind(status: string): StatusKind {
  const lower = status.toLowerCase();
  if (lower.includes('hold')) return 'warning';
  if (status === 'Declined' || status === 'Withdrawn' || status === 'NotPursued') return 'neutral';
  if (status === 'Live') return 'success';
  return 'info';
}

function formatDayMonth(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  const raw = String(value);
  // Parse a date-only ISO string (yyyy-mm-dd) as LOCAL time — `new Date('yyyy-mm-dd')` parses as
  // UTC midnight, which then formats one day earlier in negative-offset timezones (off-by-one bug).
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const date = isoDate
    ? new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]))
    : new Date(raw);
  return Number.isNaN(date.getTime())
    ? '—'
    : formatDate(date);
}

// SLA Status (BS §17.2) — the API derives it authoritatively from Due Date and the workspace's
// due-soon window; the UI only maps it to a pill kind + friendly label. null (no due date) = no pill.
function slaPill(slaStatus?: SlaStatus): { kind: StatusKind; label: string } | null {
  switch (slaStatus) {
    case 'Overdue':
      return { kind: 'error', label: 'Overdue' };
    case 'DueSoon':
      return { kind: 'warning', label: 'Due soon' };
    case 'OnTrack':
      return { kind: 'success', label: 'On track' };
    default:
      return null;
  }
}

// Time-in-stage (BS §10.6) — whole days since the current stage began; the API omits it when unknown.
function formatTimeInStage(timeInStage?: TimeInStage): string {
  if (!timeInStage) return '—';
  if (timeInStage.days <= 0) return 'Today';
  return timeInStage.days === 1 ? '1 day' : `${timeInStage.days} days`;
}

function isForbidden(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 403;
  return (error as { status?: number } | null)?.status === 403;
}

function RecordMetaStrip({ request }: { request: RequestDto }) {
  const analyst = request.fields.assignedAnalyst;
  return (
    <dl className="record-meta">
      <div className="record-meta__item">
        <dt className="record-meta__label">Display status</dt>
        <dd className="record-meta__value">
          <StatusPill
            status={displayStatusKind(request.displayStatus)}
            label={request.displayStatus}
          />
          {request.statusHold && request.statusHold !== 'InProgress' && (
            <>
              {' '}
              <StatusHoldPill statusHold={request.statusHold} />
            </>
          )}
        </dd>
      </div>
      <div className="record-meta__item">
        <dt className="record-meta__label">Assigned analyst</dt>
        <dd className="record-meta__value">{analyst ? String(analyst) : '—'}</dd>
      </div>
      <div className="record-meta__item">
        <dt className="record-meta__label">Priority score</dt>
        <dd className="record-meta__value record-meta__value--mono">
          {computePriorityScore(request.fields)}
        </dd>
      </div>
      <div className="record-meta__item">
        <dt className="record-meta__label">Due date</dt>
        <dd className="record-meta__value">{formatDayMonth(request.fields.dueDate)}</dd>
      </div>
      <div className="record-meta__item">
        <dt className="record-meta__label">Time in stage</dt>
        <dd className="record-meta__value">{formatTimeInStage(request.timeInStage)}</dd>
      </div>
    </dl>
  );
}

interface IntakeTabProps {
  request: RequestDto;
  fields: FieldDefinitionDto[] | undefined;
  schemaLoading: boolean;
  schemaError: boolean;
  patch: ReturnType<typeof usePatchRequest>;
  onFirstEdit: () => void;
}

function IntakeTab({
  request,
  fields,
  schemaLoading,
  schemaError,
  patch,
  onFirstEdit,
}: IntakeTabProps) {
  const [values, setValues] = useState<FieldValueMap>(() => ({ ...request.fields }));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-seed only when the record identity changes — NOT on every `request` reference change. A
  // successful patch re-writes the cached record (same id); depending on request.fields would clobber
  // in-flight edits. Documented deviation from exhaustive-deps per web-component-architecture.md.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setValues({ ...request.fields }), [request.id]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const handleChange = (fieldKey: string, value: unknown) => {
    onFirstEdit();
    const next: FieldValueMap = { ...values, [fieldKey]: value };
    setValues(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const payload: RequestPatchRequest = {
        name: typeof next.name === 'string' ? next.name : request.name,
        description: typeof next.description === 'string' ? next.description : request.description,
        fields: next,
        ifMatch: request.eTag,
      };
      patch.mutate(payload);
    }, SAVE_DEBOUNCE_MS);
  };

  if (schemaLoading) {
    return (
      <p className="caption" role="status">
        Loading fields…
      </p>
    );
  }
  if (schemaError || !fields) {
    return (
      <p className="mws-alert mws-alert--error" role="alert">
        The field schema could not be loaded. Try again in a moment.
      </p>
    );
  }

  const conditions = evaluateFieldConditions(fields, values);
  const stage = request.stage;

  // Escalated records: the crossing fields carry the "⇄ Crossed · locked on PG" marker. They lock
  // read-only on the PG side (the API rejects edits too), but stay editable on the AI side — the lock
  // is conceptual there (BS §6.2, blueprint §S5). `bridge.lockedFields` are the crossing field keys.
  const bridge = request.bridge;
  const onAiSide = bridge ? request.workspaceId === bridge.aiWorkspaceId : false;
  const crossingKeys = bridge ? new Set(bridge.lockedFields) : null;

  return (
    <div className="record-intake">
      {bridge && <EscalatedIntakeNote bridge={bridge} />}
      {groupFieldsBySection(fields).map((group) => {
        const visible = group.fields.filter((field) => {
          if (
            field.isReadOnly ||
            field.fieldType === 'Calculation' ||
            field.fieldType === 'DerivedCategory'
          )
            return false;
          if (conditions.hidden.has(field.fieldKey)) return false;
          return (
            field.visibleStages == null || (stage != null && field.visibleStages.includes(stage))
          );
        });
        if (visible.length === 0) return null;
        return (
          <section
            key={group.section}
            className="record-intake__section"
            aria-label={group.section}
          >
            <h2 className="record-intake__heading">{group.section}</h2>
            <div className="record-intake__grid">
              {visible.map((field) => {
                const crossed = crossingKeys?.has(field.fieldKey) ?? false;
                const control = (
                  <RequestFieldControl
                    field={field}
                    value={values[field.fieldKey]}
                    onChange={(value) => handleChange(field.fieldKey, value)}
                    required={conditions.required.has(field.fieldKey)}
                    disabled={crossed && !onAiSide}
                  />
                );
                if (!crossed) return <div key={field.fieldKey}>{control}</div>;
                return (
                  <div key={field.fieldKey} className="record-crossed">
                    <span className="record-crossed__marker">
                      <ArrowsLeftRight size={14} weight="regular" aria-hidden />
                      Crossed · locked on PG
                    </span>
                    {control}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="record-intake__readonly">
        <span className="record-intake__ro-label">Priority at escalation</span>
        <span className="record-intake__ro-value record-meta__value--mono">
          {computePriorityScore(values)}
        </span>
        <span className="record-intake__ro-label">SLA status</span>
        <span className="record-intake__ro-value">
          {(() => {
            const sla = slaPill(request.slaStatus);
            return sla ? <StatusPill status={sla.kind} label={sla.label} /> : '—';
          })()}
        </span>
        <span className="record-intake__ro-label">Submitted</span>
        <span className="record-intake__ro-value">{formatSubmitted(request.createdAt)}</span>
        <span className="record-intake__ro-label">Lifecycle</span>
        <span className="record-intake__ro-value">{request.lifecycleName || '—'}</span>
      </div>

      {patch.isError && (
        <p className="mws-alert mws-alert--warning" role="status">
          {problemMessage(patch.error, 'Your latest change has not saved yet — it will retry.')}
        </p>
      )}
    </div>
  );
}

interface StatusTabProps {
  request: RequestDto;
  setStatusHold: ReturnType<typeof useSetStatusHold>;
  setStage: ReturnType<typeof useSetStage>;
  canEscalate: boolean;
  onEscalate: () => void;
}

function StatusTab({ request, setStatusHold, setStage, canEscalate, onEscalate }: StatusTabProps) {
  const currentStatusHold = request.statusHold ?? 'InProgress';
  const closed = request.outcome ?? null;
  // One control for the record's status. It reflects the record's state — its outcome when closed,
  // else its active hold state. Active picks write statusHold; Closed picks open the Close flow.
  const [pickerValue, setPickerValue] = useState<string>(closed ? closed.value : currentStatusHold);
  const [note, setNote] = useState(request.statusHoldNote ?? '');
  const [toStage, setToStage] = useState(request.stage ?? request.stages[0]?.key ?? '');
  const [closingOutcome, setClosingOutcome] = useState<CloseOutcomeValue | null>(null);

  const activeSelected = isActiveStatus(pickerValue);
  const noteRequired = pickerValue === 'OnHold';
  const noteMissing = noteRequired && note.trim() === '';
  const stageOptions = request.stages.map((stage) => ({ value: stage.key, label: stage.label }));
  const stageGuard = useHoldGuard(request.statusHold);

  const onPickStatus = (value: string) => {
    setPickerValue(value);
    if (isActiveStatus(value)) {
      // Back to an active state — drop any in-progress close.
      setClosingOutcome(null);
    } else {
      // A Closed outcome — reveal the inline Close panel (confirm + reason + duplicate-of) in place.
      setClosingOutcome(value as CloseOutcomeValue);
    }
  };

  const cancelClose = () => {
    setClosingOutcome(null);
    setPickerValue(closed ? closed.value : currentStatusHold);
  };

  const updateStatus = () => {
    const next = pickerValue === 'OnHold' ? 'OnHold' : 'InProgress';
    setStatusHold.mutate({
      etag: request.eTag,
      statusHold: next,
      statusHoldNote: next === 'InProgress' ? null : note.trim(),
    });
  };

  return (
    <div className="record-status">
      <div className="record-status__split">
        <section className="record-card" aria-label="Record status">
          <span className="record-chip">Status</span>
          <Select
            label="Status"
            value={pickerValue}
            onChange={onPickStatus}
            groups={STATUS_PICKER_GROUPS}
            disabled={closed != null}
          />
          {closed && (
            <p className="caption">
              Closed · {closed.value}
              {closed.notes ? ` — ${closed.notes}` : ''}
            </p>
          )}
          {noteRequired && (
            <TextArea
              label="Note"
              value={note}
              onChange={setNote}
              error={noteMissing ? 'Add a reason for placing this record on hold.' : undefined}
            />
          )}
          {activeSelected && currentStatusHold === 'OnHold' && (
            <p className="mws-alert mws-alert--pending" role="status">
              <StatusHoldPill statusHold={currentStatusHold} /> Task completion and gate approvals
              are paused while this record is on hold. Set it back to <strong>In progress</strong>{' '}
              to continue.
            </p>
          )}
          {activeSelected && (
            <Button
              variant="secondary"
              onClick={updateStatus}
              disabled={setStatusHold.isPending || noteMissing}
            >
              Update status
            </Button>
          )}
          {/* Picking a "Closed" outcome reveals the close panel in place (not a pop-up) — like the
            on-hold note above. The picker chose the outcome; here we take notes and confirm. */}
          {closingOutcome && (
            <CloseRecordInline
              recordId={request.id as RecordId}
              recordName={request.name}
              outcome={closingOutcome}
              onCancel={cancelClose}
              onClosed={() => setClosingOutcome(null)}
            />
          )}
        </section>

        <section className="record-card" aria-label="Move stage">
          <span className="record-chip">Stage</span>
          <Select label="Stage" value={toStage} onChange={setToStage} options={stageOptions} />
          <Button
            variant="secondary"
            onClick={() => setStage.mutate(toStage)}
            disabled={setStage.isPending || stageGuard.disable}
            title={stageGuard.reason ?? undefined}
          >
            Move stage
          </Button>
          {stageGuard.blocked && (
            <p className="caption" role="status">
              {stageGuard.reason}
            </p>
          )}
          {setStage.data && !setStage.data.advanced && (
            <p className="mws-alert mws-alert--info" role="status">
              {setStage.data.gateOpened.gateName} opened — approve it on the Tasks &amp; gates tab
              to advance.
            </p>
          )}
        </section>
      </div>

      <RelationshipsCard
        recordId={request.id as RecordId}
        workspaceId={request.workspaceId as WorkspaceId}
      />

      <SlaBlock slaStatus={request.slaStatus} />

      {canEscalate && (
        <section className="record-card" aria-label="Escalate to AI Solutions">
          <span className="record-chip">Escalate to AI Solutions</span>
          <p className="caption">
            Hand this request to the AI Solutions team. The crossing fields lock on this side and
            the record tracks AI-side delivery through the AI Solutions Status mirror. One-time,
            one-way.
          </p>
          <Button variant="secondary" onClick={onEscalate}>
            Escalate to AI Solutions
          </Button>
        </section>
      )}
    </div>
  );
}

export function RecordDetailPage() {
  const navigate = useNavigate();
  const { recordId } = useParams();
  const recordIdTyped = recordId as RecordId | undefined;

  const { data: request, isLoading, isError, error } = useRequest(recordIdTyped);
  const workspaceId = request?.workspaceId;

  const schema = useQuery({
    queryKey: ['request-field-schema', workspaceId],
    queryFn: ({ signal }) => fetchWorkspaceFields(workspaceId as WorkspaceId, 'Request', signal),
    enabled: Boolean(workspaceId),
  });

  const fallbackId = (recordIdTyped ?? '') as RecordId;
  const patch = usePatchRequest(fallbackId);
  const setStage = useSetStage(fallbackId);
  const setStatusHold = useSetStatusHold(fallbackId);
  const { data: me } = useMe();

  const [activeTab, setActiveTab] = useState('intake');
  const [savedVisible, setSavedVisible] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);

  // v2 (slice 25). Relationship-driven tabs — filtered to non-system rows so system-seeded
  // Relationships that model existing base tabs (Request → Task) don't duplicate the specialised
  // renderers. Admin-authored Relationships with showOnFromAsTab=1 get injected between the base
  // Watchers tab and the (future) Status tab. tabId prefix guarantees no collision with base ids.
  const { tabs: relationshipTabs, relationships } = useRelationshipTabs(
    (request?.workspaceId as WorkspaceId | undefined) ?? null,
    'Request',
  );
  const relationshipTabItems = useMemo(
    () =>
      relationshipTabs
        .filter((tab) => !tab.isSystem)
        .map((tab) => ({ id: `rel:${tab.relationshipId}`, label: tab.tabLabel })),
    [relationshipTabs],
  );
  const TABS = useMemo(() => [...BASE_TABS, ...relationshipTabItems], [relationshipTabItems]);
  const activeRelationship = useMemo(() => {
    if (!activeTab.startsWith('rel:')) return null;
    const id = activeTab.slice(4);
    return relationships.find((entry) => entry.id === id) ?? null;
  }, [activeTab, relationships]);

  // Escalation is offered only on a not-yet-escalated record whose workspace is a PG workspace (the
  // API is the authority — this just hides an action the AI Solutions hub never needs). BS §6.
  const canEscalate = useMemo(() => {
    if (!request || request.bridge) return false;
    const membership = me?.memberships.find((entry) => entry.workspaceId === request.workspaceId);
    return membership ? membership.workspaceKind !== 'ai-solutions' : false;
  }, [me, request]);

  if (isLoading) {
    return (
      <main className="record-detail">
        <p className="caption" role="status">
          Loading record…
        </p>
      </main>
    );
  }

  if (isError && isForbidden(error)) {
    return <NoAccessPage resourceNoun="record" />;
  }

  if (isError || !request) {
    return (
      <main className="record-detail">
        <p className="mws-alert mws-alert--error" role="alert">
          {problemMessage(error, 'This record could not be loaded. Try again in a moment.')}
        </p>
      </main>
    );
  }

  const currentIndex = request.stages.findIndex((stage) => stage.key === request.stage);
  const activeLabel = TABS.find((tab) => tab.id === activeTab)?.label ?? 'Record section';

  return (
    <main className="record-detail">
      <nav aria-label="Breadcrumb" className="record-breadcrumb">
        <button
          type="button"
          className="record-breadcrumb__link"
          onClick={() => navigate('/requests')}
        >
          Requests
        </button>
        <CaretRight size={14} aria-hidden />
        <span className="record-breadcrumb__current" aria-current="page">
          {request.id}
        </span>
      </nav>

      <header className="record-header">
        <span className="record-header__id">{request.id}</span>
        {request.bridge && (
          <span className="record-header__pill">
            <StatusPill status="info" label={`Escalated · ${request.bridge.originWorkspaceName}`} />
          </span>
        )}
        <h1 className="record-header__name">{request.name}</h1>
        <AddToCatalogButton sourceRecordId={request.id} />
      </header>

      <RecordMetaStrip request={request} />

      <div className="ast-stepper-bar">
        <Stepper
          compact
          steps={request.stages.map((stage) => ({ label: stage.label }))}
          currentIndex={currentIndex}
        />
      </div>

      <div className="record-tabrow">
        <Tabs tabs={TABS} value={activeTab} onChange={setActiveTab} label="Record sections" />
        <span className="record-saved" aria-live="polite">
          {savedVisible && (
            <>
              <CloudCheck size={16} aria-hidden />
              All changes saved
            </>
          )}
        </span>
      </div>

      <div className="record-tabpanel" role="tabpanel" aria-label={activeLabel}>
        {activeTab === 'intake' && (
          <IntakeTab
            request={request}
            fields={schema.data?.fields}
            schemaLoading={schema.isLoading}
            schemaError={schema.isError}
            patch={patch}
            onFirstEdit={() => setSavedVisible(true)}
          />
        )}
        {activeTab === 'status' && (
          <StatusTab
            request={request}
            setStatusHold={setStatusHold}
            setStage={setStage}
            canEscalate={canEscalate}
            onEscalate={() => setEscalateOpen(true)}
          />
        )}
        {activeTab === 'attachments' && <AttachmentsCard recordId={request.id as RecordId} />}
        {activeTab === 'tasks' && (
          <TasksTab
            recordId={request.id as RecordId}
            workspaceId={request.workspaceId as WorkspaceId}
            paused={(request.statusHold ?? 'InProgress') !== 'InProgress'}
          />
        )}
        {activeTab === 'activity' && <ActivityTab recordId={request.id as RecordId} />}
        {activeTab === 'watchers' && <WatchersCard request={request} />}
        {activeRelationship && (
          <GenericRelatedRecordsTab
            workspaceId={request.workspaceId as WorkspaceId}
            recordId={request.id as RecordId}
            relationship={activeRelationship}
          />
        )}
      </div>

      {escalateOpen && (
        <EscalateModal
          recordId={request.id as RecordId}
          recordName={request.name}
          onClose={() => setEscalateOpen(false)}
        />
      )}
    </main>
  );
}

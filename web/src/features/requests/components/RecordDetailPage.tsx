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
  WorkspaceId,
} from '@shared/types';

import { Button } from '@/shared/components/Button';
import { Select, TextArea } from '@/shared/components/Form';
import { Stepper, StatusPill, Tabs } from '@/shared/components/Feedback';
import { NoAccessPage } from '@/shared/components/EdgeStates';
import { ApiError } from '@/shared/http/apiClient';
import { fetchWorkspaceFields } from '@/features/fields/api';
import { ActivityTab } from '@/features/comments';
import { TasksTab } from '@/features/tasks';
import { useMe } from '@/features/users/useMe';
import { EscalateModal, EscalatedIntakeNote } from '@/features/escalation';
import { AddToCatalogButton } from '@/features/features';
import { CloseRecordModal } from '@/features/closure';
import { RelationshipsCard } from '@/features/typed-links';
import { AttachmentsCard } from '@/features/attachments';
import { WatchersCard } from '@/features/watchers';

import { RequestFieldControl } from './RequestFieldControl';
import { useRequest, usePatchRequest, useSetHold, useSetStage } from '../useRequests';
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

const TABS: { id: string; label: string }[] = [
  { id: 'status', label: 'Status' },
  { id: 'intake', label: 'Intake' },
  { id: 'attachments', label: 'Attachments' },
  { id: 'tasks', label: 'Tasks & gates' },
  { id: 'activity', label: 'Activity' },
  { id: 'watchers', label: 'Watchers & alerts' },
];

const STATUS_OPTIONS = [
  { value: 'Active', label: 'Active' },
  { value: 'On hold', label: 'On hold' },
];

function displayStatusKind(status: string): StatusKind {
  const lower = status.toLowerCase();
  if (lower.includes('hold')) return 'warning';
  if (status === 'Declined' || status === 'Abandoned') return 'neutral';
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
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function formatSubmitted(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function slaLabel(request: RequestDto, values: FieldValueMap): string {
  if (request.slaStatus) return request.slaStatus;
  const due = values.dueDate;
  if (due === undefined || due === null || due === '') return 'On track';
  const dueDate = new Date(String(due));
  if (Number.isNaN(dueDate.getTime())) return 'On track';
  return dueDate.getTime() < Date.now() ? 'Overdue' : 'On track';
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
        <span className="record-intake__ro-value">{slaLabel(request, values)}</span>
        <span className="record-intake__ro-label">Submitted</span>
        <span className="record-intake__ro-value">{formatSubmitted(request.createdAt)}</span>
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
  setHold: ReturnType<typeof useSetHold>;
  setStage: ReturnType<typeof useSetStage>;
  canEscalate: boolean;
  onEscalate: () => void;
}

function StatusTab({ request, setHold, setStage, canEscalate, onEscalate }: StatusTabProps) {
  const [statusChoice, setStatusChoice] = useState(request.hold?.held ? 'On hold' : 'Active');
  const [reason, setReason] = useState(request.hold?.reason ?? '');
  const [toStage, setToStage] = useState(request.stage ?? request.stages[0]?.key ?? '');
  const [closeOpen, setCloseOpen] = useState(false);

  const reasonRequired = statusChoice === 'On hold';
  const reasonMissing = reasonRequired && reason.trim() === '';
  const stageOptions = request.stages.map((s) => ({ value: s.key, label: s.label }));
  const closed = request.outcome ?? null;

  const updateStatus = () => {
    const held = statusChoice === 'On hold';
    const trimmed = reason.trim();
    setHold.mutate(trimmed ? { held, reason: trimmed } : { held });
  };

  return (
    <div className="record-status">
      <section className="record-card" aria-label="Status override">
        <Select
          label="Status override"
          value={statusChoice}
          onChange={setStatusChoice}
          options={STATUS_OPTIONS}
        />
        {reasonRequired && (
          <TextArea
            label="Reason"
            value={reason}
            onChange={setReason}
            error={reasonMissing ? 'Add a reason for the hold.' : undefined}
          />
        )}
        <Button
          variant="secondary"
          onClick={updateStatus}
          disabled={setHold.isPending || reasonMissing}
        >
          Update status
        </Button>
      </section>

      <section className="record-card" aria-label="Move stage">
        <Select label="Stage" value={toStage} onChange={setToStage} options={stageOptions} />
        <Button
          variant="secondary"
          onClick={() => setStage.mutate(toStage)}
          disabled={setStage.isPending}
        >
          Move stage
        </Button>
        {setStage.data && !setStage.data.advanced && (
          <p className="mws-alert mws-alert--info" role="status">
            {setStage.data.gateOpened.gateName} opened — approve it on the Tasks &amp; gates tab to
            advance.
          </p>
        )}
      </section>

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

      <RelationshipsCard
        recordId={request.id as RecordId}
        workspaceId={request.workspaceId as WorkspaceId}
      />

      <section className="record-card" aria-label="Close record">
        <span className="record-chip">Close record</span>
        {closed ? (
          <p className="caption">
            Closed · {closed.value}
            {closed.notes ? ` — ${closed.notes}` : ''}
          </p>
        ) : (
          <>
            <p className="caption">
              Record a final outcome for this request. You can still read it afterward.
            </p>
            <Button variant="secondary" onClick={() => setCloseOpen(true)}>
              Close record
            </Button>
          </>
        )}
      </section>

      {closeOpen && (
        <CloseRecordModal
          recordId={request.id as RecordId}
          recordName={request.name}
          onClose={() => setCloseOpen(false)}
        />
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
  const setHold = useSetHold(fallbackId);
  const { data: me } = useMe();

  const [activeTab, setActiveTab] = useState('intake');
  const [savedVisible, setSavedVisible] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);

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
            setHold={setHold}
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
            paused={request.hold?.held ?? false}
          />
        )}
        {activeTab === 'activity' && <ActivityTab recordId={request.id as RecordId} />}
        {activeTab === 'watchers' && <WatchersCard recordId={request.id as RecordId} />}
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

// S3 Intake — create a Request. The form is data-driven from the workspace field schema, grouped
// into the four numbered create sections (Intake · Value mapping · Solution details · Triage) with
// the condition engine evaluated client-side so the Client-number reveal happens live. Special
// controls override the generic field renderer: a Lifecycle picker (shown only when the workspace
// has more than one lifecycle), a Priority-score widget (three sliders + live score), and the
// Client/Matter reveal. Renders explicit
// loading / error states; the similar-requests aside is a slice-6 stub. (web-component-architecture.md)

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowSquareOut, Link as LinkIcon, X } from '@phosphor-icons/react';

import type {
  DraftId,
  FieldDefinitionDto,
  LifecycleId,
  QueuedLink,
  RecordId,
  RequestCreateRequest,
  WorkspaceId,
} from '@shared/types';

import { Button } from '@/shared/components/Button';
import { RangeSlider, Select } from '@/shared/components/Form';
import { SIMILAR_DEBOUNCE_MS } from '@/shared/constants';
import { useMe } from '@/features/users/useMe';
import { fetchWorkspaceFields } from '@/features/fields/api';
import { useWorkspaceLifecycles } from '@/features/lifecycle/useLifecycle';

import { RequestFieldControl } from './RequestFieldControl';
import { fetchDraft } from '../api';
import {
  INTAKE_CREATE_SECTIONS,
  computePriorityScore,
  evaluateFieldConditions,
  filterSections,
  groupFieldsBySection,
  validateRequestForm,
  type FieldValueMap,
} from '../requestForm';
import { problemMessage } from '../problemMessage';
import { resolveActiveWorkspaceId } from '../workspace';
import { useCreateRequest, useSimilarRequests } from '../useRequests';
import { useSaveDraft } from '../useDrafts';
import '../intakeForm.css';

const SLIDER_MIN = 1;
const SLIDER_MAX = 5;
const SLIDER_STEP = 1;
const SLIDER_DEFAULT = 3;
/** Value-mapping fields the Priority-score widget renders in place of the generic controls. */
const VALUE_MAPPING_WIDGET_KEYS = new Set([
  'businessValue',
  'efficiencyGain',
  'levelOfEffort',
  'priorityScore',
]);
/** Intake keys the special Request-type select owns. */
const REQUEST_TYPE_KEYS = new Set(['requestType']);
/** Revealed only when the request is a client engagement. */
const CLIENT_ONLY_KEYS = new Set(['clientNumber', 'matterNumber']);
/** Field types that span the full width of the two-up grid. */
const FULL_WIDTH_TYPES = new Set(['LongText', 'RichText']);

export function IntakeFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const draftId = searchParams.get('draftId');

  const { data: me, isLoading: isMeLoading, isError: isMeError } = useMe();
  const workspaceId = resolveActiveWorkspaceId(me?.memberships);
  const wsId = (workspaceId ?? '') as WorkspaceId;

  const schemaQuery = useQuery({
    queryKey: ['request-field-schema', workspaceId],
    queryFn: ({ signal }) => fetchWorkspaceFields(workspaceId as WorkspaceId, 'Request', signal),
    enabled: Boolean(workspaceId),
  });
  const lifecycleQuery = useWorkspaceLifecycles(workspaceId ?? undefined);
  const draftQuery = useQuery({
    queryKey: ['draft', draftId],
    queryFn: ({ signal }) => fetchDraft(draftId as DraftId, signal),
    enabled: Boolean(draftId),
  });

  const createRequest = useCreateRequest(wsId);
  const saveDraft = useSaveDraft(wsId);

  const [values, setValues] = useState<FieldValueMap>({
    businessValue: SLIDER_DEFAULT,
    efficiencyGain: SLIDER_DEFAULT,
    levelOfEffort: SLIDER_DEFAULT,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [triedSubmit, setTriedSubmit] = useState(false);
  // Similar-requests the user chose to link as `related` — stamped on the record at submit (slice 10
  // owns the typed-link write; the API accepts the queued ids on create).
  const [queuedRelated, setQueuedRelated] = useState<RecordId[]>([]);
  // Kinded link-backs carried on the draft by Copy / Promote — stamped as typed links at submit.
  const [queuedLinks, setQueuedLinks] = useState<QueuedLink[]>([]);
  // v2 (slice 27) — the lifecycle chosen at the Lifecycle picker. Empty means "not yet chosen";
  // the render falls back to the workspace default so submit always resolves a lifecycle.
  const [lifecycleId, setLifecycleId] = useState<LifecycleId | ''>('');

  const toggleRelated = (id: RecordId) =>
    setQueuedRelated((prev) =>
      prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id],
    );

  // Seed values + queued links from a resumed draft once its body loads (defaults stay for anything
  // it omits). The queued links are what make a Copy / Promote link-back land as a typed link on submit.
  const seededDraftRef = useRef(false);
  useEffect(() => {
    const resumed = draftQuery.data;
    if (seededDraftRef.current || !draftId || !resumed) return;
    setValues((prev) => ({ ...prev, ...resumed.body.fields }));
    if (resumed.body.related?.length) setQueuedRelated(resumed.body.related);
    if (resumed.body.queuedLinks?.length) setQueuedLinks(resumed.body.queuedLinks);
    seededDraftRef.current = true;
  }, [draftId, draftQuery.data]);

  const setField = (fieldKey: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [fieldKey]: value }));

  if (isMeLoading && !me) {
    return (
      <main className="requests-page">
        <h1 className="h2">New request</h1>
        <p className="caption" role="status">
          Loading the intake form…
        </p>
      </main>
    );
  }

  if (isMeError || !workspaceId) {
    return (
      <main className="requests-page">
        <h1 className="h2">New request</h1>
        <p className="mws-alert mws-alert--error" role="alert">
          We couldn’t open the intake form. You need a workspace to create a request — ask an admin
          for access, then try again.
        </p>
      </main>
    );
  }

  if (
    schemaQuery.isLoading ||
    lifecycleQuery.isLoading ||
    (Boolean(draftId) && draftQuery.isLoading)
  ) {
    return (
      <main className="requests-page">
        <h1 className="h2">New request</h1>
        <p className="caption" role="status">
          Loading the intake form…
        </p>
      </main>
    );
  }

  if (schemaQuery.isError || lifecycleQuery.isError || !schemaQuery.data || !lifecycleQuery.data) {
    return (
      <main className="requests-page">
        <h1 className="h2">New request</h1>
        <p className="mws-alert mws-alert--error" role="alert">
          {problemMessage(
            schemaQuery.error ?? lifecycleQuery.error,
            'We couldn’t load the intake form. Try again in a moment.',
          )}
        </p>
      </main>
    );
  }

  const schema = schemaQuery.data;
  const sections = filterSections(groupFieldsBySection(schema.fields), INTAKE_CREATE_SECTIONS);
  const conditions = evaluateFieldConditions(schema.fields, values);

  const isHidden = (field: FieldDefinitionDto): boolean =>
    conditions.hidden.has(field.fieldKey) ||
    (CLIENT_ONLY_KEYS.has(field.fieldKey) && values.deptPgClient !== 'Client');

  // v2 (slice 27): a first-class Lifecycle picker. Options are lifecycle names (the single label —
  // the separate "Request type" was dropped). The picker is hidden when the workspace has only one
  // lifecycle (nothing to choose); the chosen lifecycleId is sent first-class on submit, and a
  // request runs on that lifecycle for its whole life.
  const lifecycles = lifecycleQuery.data;
  const defaultLifecycle = lifecycles.find((lifecycle) => lifecycle.isDefault) ?? lifecycles[0];
  const selectedLifecycleId = (lifecycleId || defaultLifecycle?.id || '') as LifecycleId | '';
  const lifecycleOptions = lifecycles.map((lifecycle) => ({
    value: lifecycle.id,
    label: lifecycle.isDefault ? `${lifecycle.name} (default)` : lifecycle.name,
  }));
  const lifecyclePicker =
    lifecycles.length > 1 ? (
      <Select
        label="Lifecycle"
        value={selectedLifecycleId}
        onChange={(value) => setLifecycleId(value as LifecycleId)}
        options={lifecycleOptions}
        hint="Sets the stages and approval gates this request will follow."
      />
    ) : undefined;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTriedSubmit(true);
    const validation = validateRequestForm(schema.fields, values);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    const payload: RequestCreateRequest = {
      name: String(values.name ?? ''),
      description: String(values.description ?? ''),
      fields: values,
      ...(selectedLifecycleId ? { lifecycleId: selectedLifecycleId } : {}),
      ...(queuedRelated.length > 0 ? { queuedRelatedRecordIds: queuedRelated } : {}),
      ...(queuedLinks.length > 0 ? { queuedLinks } : {}),
    };
    try {
      const created = await createRequest.mutateAsync(payload);
      navigate(`/requests/${created.id}`);
    } catch {
      // Surfaced to the user via the inline alert (createRequest.isError). No rethrow.
    }
  };

  const handleSaveDraft = async () => {
    const title = typeof values.name === 'string' && values.name.trim() ? values.name : null;
    try {
      await saveDraft.mutateAsync({
        objectType: 'Request',
        title,
        body: {
          fields: values,
          ...(queuedRelated.length > 0 ? { related: queuedRelated } : {}),
          ...(queuedLinks.length > 0 ? { queuedLinks } : {}),
        },
      });
      navigate('/requests');
    } catch {
      // Surfaced to the user via the inline alert (saveDraft.isError). No rethrow.
    }
  };

  const mutationError = createRequest.isError
    ? problemMessage(createRequest.error)
    : saveDraft.isError
      ? problemMessage(saveDraft.error)
      : null;

  return (
    <main className="requests-page">
      <h1 className="h2">New request</h1>

      <div className="ast-intake">
        <form
          className="ast-intake__form"
          onSubmit={handleSubmit}
          noValidate
          aria-label="New request"
        >
          {sections.map((group) => {
            const number =
              INTAKE_CREATE_SECTIONS.indexOf(
                group.section as (typeof INTAKE_CREATE_SECTIONS)[number],
              ) + 1;
            const isValueMapping = group.section === 'Value mapping';
            const isIntake = group.section === 'Intake';
            const skipKeys = isValueMapping
              ? VALUE_MAPPING_WIDGET_KEYS
              : isIntake
                ? REQUEST_TYPE_KEYS
                : new Set<string>();

            return (
              <IntakeSection
                key={group.section}
                number={number}
                section={group.section}
                fields={group.fields}
                values={values}
                errors={triedSubmit ? errors : {}}
                requiredKeys={conditions.required}
                skipKeys={skipKeys}
                isHidden={isHidden}
                onFieldChange={setField}
                lead={isIntake ? lifecyclePicker : undefined}
                widget={
                  isValueMapping ? (
                    <PriorityScoreWidget values={values} onChange={setField} />
                  ) : undefined
                }
                aiSuggest={{ workspaceId: wsId, objectType: 'Request' }}
              />
            );
          })}

          {mutationError && (
            <p className="mws-alert mws-alert--error" role="alert">
              {mutationError}
            </p>
          )}

          <div className="ast-actions">
            <Button variant="secondary" onClick={handleSaveDraft} disabled={saveDraft.isPending}>
              Save draft
            </Button>
            <Button variant="primary" type="submit" disabled={createRequest.isPending}>
              Submit request
            </Button>
          </div>
        </form>

        <aside className="ast-intake__aside">
          <SimilarRequestsPanel
            workspaceId={wsId}
            nameValue={typeof values.name === 'string' ? values.name : ''}
            descriptionValue={typeof values.description === 'string' ? values.description : ''}
            queuedRelated={queuedRelated}
            onToggleLink={toggleRelated}
          />
        </aside>
      </div>
    </main>
  );
}

interface IntakeSectionProps {
  number: number;
  section: string;
  fields: FieldDefinitionDto[];
  values: FieldValueMap;
  errors: Record<string, string>;
  requiredKeys: Set<string>;
  skipKeys: Set<string>;
  isHidden: (field: FieldDefinitionDto) => boolean;
  onFieldChange: (fieldKey: string, value: unknown) => void;
  lead?: ReactNode | undefined;
  widget?: ReactNode | undefined;
  aiSuggest?: { workspaceId: WorkspaceId; objectType: string } | undefined;
}

function IntakeSection({
  number,
  section,
  fields,
  values,
  errors,
  requiredKeys,
  skipKeys,
  isHidden,
  onFieldChange,
  lead,
  widget,
  aiSuggest,
}: IntakeSectionProps) {
  const headingId = `section-${number}-heading`;
  const visible = fields.filter((field) => !skipKeys.has(field.fieldKey) && !isHidden(field));

  return (
    <section className="mws-card ast-section" aria-labelledby={headingId}>
      <header className="ast-section__head">
        <span className="ast-section__num" aria-hidden="true">
          {number}
        </span>
        <h2 id={headingId} className="ast-section__title">
          {section}
        </h2>
      </header>

      {lead}
      {widget}

      {visible.length > 0 && (
        <div className="ast-two-col">
          {visible.map((field) => (
            <div
              key={field.fieldKey}
              className={
                FULL_WIDTH_TYPES.has(field.fieldType) ? 'ast-field ast-field--full' : 'ast-field'
              }
            >
              <RequestFieldControl
                field={field}
                value={values[field.fieldKey]}
                onChange={(value) => onFieldChange(field.fieldKey, value)}
                required={requiredKeys.has(field.fieldKey)}
                error={errors[field.fieldKey]}
                suggest={aiSuggest ? { ...aiSuggest, siblingValues: values } : undefined}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

interface PriorityScoreWidgetProps {
  values: FieldValueMap;
  onChange: (fieldKey: string, value: unknown) => void;
}

function PriorityScoreWidget({ values, onChange }: PriorityScoreWidgetProps) {
  const score = computePriorityScore(values);
  const sliderValue = (fieldKey: string): number => {
    const numeric = Number(values[fieldKey]);
    return Number.isFinite(numeric) ? numeric : SLIDER_DEFAULT;
  };

  return (
    <div className="ast-priority">
      <div className="ast-priority__sliders">
        <RangeSlider
          label="Business value"
          value={sliderValue('businessValue')}
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={SLIDER_STEP}
          onChange={(next) => onChange('businessValue', next)}
        />
        <RangeSlider
          label="Efficiency gain"
          value={sliderValue('efficiencyGain')}
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={SLIDER_STEP}
          onChange={(next) => onChange('efficiencyGain', next)}
        />
        <RangeSlider
          label="Level of effort"
          value={sliderValue('levelOfEffort')}
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={SLIDER_STEP}
          onChange={(next) => onChange('levelOfEffort', next)}
        />
      </div>
      <div className="ast-priority__score">
        <span className="eyebrow ast-priority__eyebrow">Priority score</span>
        <output className="ast-priority__value" aria-label="Priority score">
          {score}
        </output>
        <span className="ast-priority__formula">
          Business Value + Efficiency Gain − Level of Effort
        </span>
      </div>
    </div>
  );
}

interface SimilarRequestsPanelProps {
  workspaceId: WorkspaceId;
  nameValue: string;
  descriptionValue: string;
  queuedRelated: RecordId[];
  onToggleLink: (id: RecordId) => void;
}

function SimilarRequestsPanel({
  workspaceId,
  nameValue,
  descriptionValue,
  queuedRelated,
  onToggleLink,
}: SimilarRequestsPanelProps) {
  const navigate = useNavigate();
  const rawQuery = `${nameValue} ${descriptionValue}`.trim();

  // Debounce the typed name+description before querying so every keystroke doesn't hit the API.
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(rawQuery), SIMILAR_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  const [dismissed, setDismissed] = useState<Set<RecordId>>(() => new Set());
  const { data: matches } = useSimilarRequests(workspaceId, debounced);

  const visible = (matches ?? []).filter((match) => !dismissed.has(match.id));

  return (
    <section className="mws-card ast-similar" aria-labelledby="similar-heading">
      <h2 id="similar-heading" className="mws-card__eyebrow">
        Similar requests
      </h2>
      {visible.length === 0 ? (
        <p className="body ast-similar__hint">
          Matches appear here as you type the name and description.
        </p>
      ) : (
        <ul className="ast-similar__list">
          {visible.map((match) => {
            const linked = queuedRelated.includes(match.id);
            return (
              <li key={match.id} className="ast-similar__item">
                <div className="ast-similar__row">
                  <span className="ast-similar__id">{match.id}</span>
                  {match.stage && <span className="ast-similar__stage">· {match.stage}</span>}
                  <span className="ast-similar__spacer" />
                  <button
                    type="button"
                    className="ast-similar__dismiss"
                    aria-label={`Dismiss ${match.id}`}
                    onClick={() => setDismissed((prev) => new Set(prev).add(match.id))}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
                <span className="ast-similar__name">{match.name}</span>
                <div className="ast-similar__actions">
                  {linked ? (
                    <span className="ast-similar__linked">Linked as related</span>
                  ) : (
                    <button
                      type="button"
                      className="ast-similar__action"
                      onClick={() => onToggleLink(match.id)}
                    >
                      <LinkIcon size={14} aria-hidden />
                      Link as related
                    </button>
                  )}
                  <button
                    type="button"
                    className="ast-similar__action"
                    onClick={() => navigate(`/requests/${match.id}`)}
                  >
                    <ArrowSquareOut size={14} aria-hidden />
                    Open
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

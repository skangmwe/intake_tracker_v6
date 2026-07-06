// S13 Add to catalog — the new-feature form. Blank when reached from S9's "New feature"; prefilled
// from a source Request when reached with `?draft={id}` (the Add-to-catalog draft, §9.7). On submit
// it mints a Feature and — for a prefilled draft — stamps the queued `sourced-from` link back to the
// source Request (BS §5), then discards the draft and opens the new feature (S10).

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import type {
  DraftDto,
  DraftId,
  FeatureCreateRequest,
  FeatureType,
  QueuedLink,
  UserId,
} from '@shared/types';

import { Button } from '@/shared/components/Button';
import { Select, TextArea, TextField } from '@/shared/components/Form';

import { deleteFeatureDraft, fetchFeatureDraft } from '../api';
import { useCreateFeature } from '../useFeatures';
import '../features.css';

const FEATURE_TYPES: Array<{ value: FeatureType; label: string }> = [
  { value: 'UI/visual', label: 'UI / visual' },
  { value: 'Functional', label: 'Functional' },
  { value: 'Integration', label: 'Integration' },
  { value: 'Workflow', label: 'Workflow' },
  { value: 'Data/reporting', label: 'Data / reporting' },
];

interface FormState {
  name: string;
  oneLiner: string;
  whatItDoes: string;
  featureType: string;
  capabilityTags: string;
  solutionPattern: string;
  techStack: string;
  howToReuse: string;
  demoUrl: string;
  repoUrl: string;
  owner: string;
}

const EMPTY: FormState = {
  name: '',
  oneLiner: '',
  whatItDoes: '',
  featureType: '',
  capabilityTags: '',
  solutionPattern: '',
  techStack: '',
  howToReuse: '',
  demoUrl: '',
  repoUrl: '',
  owner: '',
};

function csvToList(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function listFromDraft(fields: Record<string, unknown>, key: string): string {
  const value = fields[key];
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === 'string').join(', ');
  return typeof value === 'string' ? value : '';
}

function prefillFromDraft(draft: DraftDto): FormState {
  const fields = draft.body.fields ?? {};
  return {
    ...EMPTY,
    name: draft.title ?? '',
    techStack: listFromDraft(fields, 'techStack'),
    solutionPattern: listFromDraft(fields, 'solutionPattern'),
    repoUrl: typeof fields.repoUrl === 'string' ? fields.repoUrl : '',
  };
}

export function AddToCatalogPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const draftId = searchParams.get('draft') as DraftId | null;

  const draftQuery = useQuery<DraftDto>({
    queryKey: ['feature-draft', draftId],
    queryFn: ({ signal }) => fetchFeatureDraft(draftId as DraftId, signal),
    enabled: Boolean(draftId),
  });

  const [form, setForm] = useState<FormState>(EMPTY);
  const [prefilled, setPrefilled] = useState(false);
  const create = useCreateFeature();

  useEffect(() => {
    if (draftQuery.data && !prefilled) {
      setForm(prefillFromDraft(draftQuery.data));
      setPrefilled(true);
    }
  }, [draftQuery.data, prefilled]);

  const queuedLinks: QueuedLink[] = useMemo(
    () => (draftQuery.data?.body.queuedLinks ?? []) as QueuedLink[],
    [draftQuery.data],
  );

  const set = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));
  const canSubmit = form.name.trim().length > 0 && form.featureType !== '' && !create.isPending;

  const submit = () => {
    if (!canSubmit) return;
    const request: FeatureCreateRequest = {
      name: form.name.trim(),
      oneLiner: form.oneLiner.trim(),
      whatItDoes: form.whatItDoes.trim(),
      featureType: form.featureType as FeatureType,
      capabilityTags: csvToList(form.capabilityTags),
      solutionPattern: csvToList(form.solutionPattern),
      techStack: csvToList(form.techStack),
      howToReuse: form.howToReuse.trim(),
      ...(form.owner.trim() ? { owner: form.owner.trim() as UserId } : {}),
      ...(form.demoUrl.trim() ? { demoUrl: form.demoUrl.trim() } : {}),
      ...(form.repoUrl.trim() ? { repoUrl: form.repoUrl.trim() } : {}),
      ...(queuedLinks.length > 0 ? { queuedLinks } : {}),
    };
    create.mutate(request, {
      onSuccess: (feature) => {
        if (draftId) void deleteFeatureDraft(draftId).catch(() => undefined);
        navigate(`/feature-catalog/${feature.id}`);
      },
    });
  };

  const heading = draftId ? 'Add to catalog' : 'New feature';

  return (
    <main className="add-to-catalog-page">
      <h1 className="h1 atc-title">{heading}</h1>
      {draftId && (
        <p className="atc-lede">
          Prefilled from the source request. Add a one-liner and reuse notes, then save it to the
          catalog — a link back to the source is stamped automatically.
        </p>
      )}

      <form
        className="atc-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <TextField
          label="Name"
          value={form.name}
          onChange={(name) => set({ name })}
          placeholder="Feature name"
        />
        <TextField
          label="One-liner"
          value={form.oneLiner}
          onChange={(oneLiner) => set({ oneLiner })}
          optional
          placeholder="A scannable one-sentence summary"
        />
        <TextArea
          label="What it does"
          value={form.whatItDoes}
          onChange={(whatItDoes) => set({ whatItDoes })}
          optional
        />
        <Select
          label="Feature type"
          value={form.featureType}
          onChange={(featureType) => set({ featureType })}
          options={FEATURE_TYPES}
          placeholder="Select a type…"
        />
        <TextField
          label="Capability tags"
          value={form.capabilityTags}
          onChange={(capabilityTags) => set({ capabilityTags })}
          optional
          hint="Comma-separated"
        />
        <TextField
          label="Solution pattern"
          value={form.solutionPattern}
          onChange={(solutionPattern) => set({ solutionPattern })}
          optional
          hint="Comma-separated"
        />
        <TextField
          label="Tech / stack"
          value={form.techStack}
          onChange={(techStack) => set({ techStack })}
          optional
          hint="Comma-separated"
        />
        <TextArea
          label="How to reuse"
          value={form.howToReuse}
          onChange={(howToReuse) => set({ howToReuse })}
          optional
        />
        <TextField
          label="Demo URL"
          value={form.demoUrl}
          onChange={(demoUrl) => set({ demoUrl })}
          optional
        />
        <TextField
          label="Repo / component URL"
          value={form.repoUrl}
          onChange={(repoUrl) => set({ repoUrl })}
          optional
        />
        <TextField label="Owner" value={form.owner} onChange={(owner) => set({ owner })} optional />

        {create.isError && (
          <p className="mws-alert mws-alert--error" role="alert">
            The feature couldn&apos;t be saved. Check your access to the AI Solutions workspace and
            try again.
          </p>
        )}

        <div className="atc-actions">
          <Button variant="secondary" onClick={() => navigate('/feature-catalog')}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!canSubmit}>
            {create.isPending ? 'Saving…' : 'Save to catalog'}
          </Button>
        </div>
      </form>
    </main>
  );
}

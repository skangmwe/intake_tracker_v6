// S10 Feature detail — the full spec of a reusable feature. Header (name + maturity + publish/
// deprecate) over grouped field sections (Summary / Classification / Reuse & provenance /
// Governance / Identity), with the shared Attachments (visuals) and Relationships (sourced-from
// provenance) cards on the side panel. Maturity change is a normal member edit, captured in audit.

import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';

import type { FeatureDto, RecordId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { NoAccessPage } from '@/shared/components/EdgeStates';
import { ApiError } from '@/shared/http/apiClient';
import { AttachmentsCard } from '@/features/attachments';
import { RelationshipsCard } from '@/features/typed-links';
import { useMe } from '@/features/users/useMe';

import { useFeature, useSetFeatureMaturity } from '../useFeatures';
import '../features.css';

const EM_DASH = '—';

function MaturityBadge({ maturity }: { maturity: string }) {
  const tone =
    maturity === 'Published'
      ? 'fc-badge--published'
      : maturity === 'Deprecated'
        ? 'fc-badge--deprecated'
        : 'fc-badge--draft';
  return (
    <span className={`fc-badge ${tone}`} data-ds="badge">
      {maturity}
    </span>
  );
}

function TextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="fd-field">
      <dt className="fd-field__label">{label}</dt>
      <dd className="fd-field__value">{value || EM_DASH}</dd>
    </div>
  );
}

function TagsRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="fd-field">
      <dt className="fd-field__label">{label}</dt>
      <dd className="fd-field__value">
        {values.length === 0 ? (
          EM_DASH
        ) : (
          <span className="fd-chips">
            {values.map((value) => (
              <span key={value} className="fd-chip">
                {value}
              </span>
            ))}
          </span>
        )}
      </dd>
    </div>
  );
}

/** Only http(s) URLs render as links — guards against `javascript:`/`data:` hrefs (XSS). */
function safeHref(value: string | undefined): string | null {
  if (!value) return null;
  return /^https?:\/\//i.test(value.trim()) ? value.trim() : null;
}

function LinkRow({ label, href }: { label: string; href: string | undefined }) {
  const safe = safeHref(href);
  return (
    <div className="fd-field">
      <dt className="fd-field__label">{label}</dt>
      <dd className="fd-field__value">
        {safe ? (
          <a className="fd-link" href={safe} target="_blank" rel="noopener noreferrer">
            {safe}
          </a>
        ) : (
          (href ?? EM_DASH)
        )}
      </dd>
    </div>
  );
}

function MaturityActions({ feature }: { feature: FeatureDto }) {
  const maturity = useSetFeatureMaturity(feature.id);
  return (
    <div className="fd-actions">
      {feature.maturity !== 'Published' && (
        <Button
          variant="primary"
          onClick={() => maturity.mutate('publish')}
          disabled={maturity.isPending}
        >
          Publish
        </Button>
      )}
      {feature.maturity !== 'Deprecated' && (
        <Button
          variant="secondary"
          onClick={() => maturity.mutate('deprecate')}
          disabled={maturity.isPending}
        >
          Deprecate
        </Button>
      )}
      {maturity.isError && (
        <span className="mws-alert mws-alert--error fd-actions__error" role="alert">
          Couldn&apos;t change the maturity. Check your access.
        </span>
      )}
    </div>
  );
}

export function FeatureDetailPage() {
  const { recordId } = useParams<{ recordId: string }>();
  const { data: me } = useMe();
  const {
    data: feature,
    isLoading,
    isError,
    error,
  } = useFeature(recordId as RecordId | undefined);

  const canEdit = useMemo(
    () =>
      (me?.memberships ?? []).some(
        (m) =>
          m.workspaceKind === 'ai-solutions' &&
          (m.level === 'Member' || m.level === 'WorkspaceAdmin'),
      ),
    [me],
  );

  if (isLoading) {
    return (
      <main className="feature-detail-page">
        <p className="caption" role="status">
          Loading feature…
        </p>
      </main>
    );
  }

  if (isError && error instanceof ApiError && error.status === 403) {
    return <NoAccessPage resourceNoun="feature" />;
  }

  if (isError || !feature) {
    return (
      <main className="feature-detail-page">
        <Link className="fd-back" to="/feature-catalog">
          <ArrowLeft size={16} weight="regular" aria-hidden /> Back to catalog
        </Link>
        <p className="mws-alert mws-alert--error" role="alert">
          This feature couldn&apos;t be loaded. Try again in a moment.
        </p>
      </main>
    );
  }

  return (
    <main className="feature-detail-page">
      <Link className="fd-back" to="/feature-catalog">
        <ArrowLeft size={16} weight="regular" aria-hidden /> Back to catalog
      </Link>

      <header className="fd-header">
        <div className="fd-header__heading">
          <h1 className="h1 fd-title">{feature.name}</h1>
          <MaturityBadge maturity={feature.maturity} />
        </div>
        {canEdit && <MaturityActions feature={feature} />}
      </header>

      <div className="fd-layout">
        <div className="fd-main">
          <section className="fd-group" aria-labelledby="fd-summary">
            <h2 id="fd-summary" className="fd-group__title">
              Summary
            </h2>
            <dl className="fd-fields">
              <TextRow label="One-liner" value={feature.oneLiner} />
              <TextRow label="What it does" value={feature.whatItDoes} />
            </dl>
          </section>

          <section className="fd-group" aria-labelledby="fd-classification">
            <h2 id="fd-classification" className="fd-group__title">
              Classification
            </h2>
            <dl className="fd-fields">
              <TextRow label="Feature type" value={feature.featureType} />
              <TagsRow label="Capability tags" values={feature.capabilityTags} />
              <TagsRow label="Solution pattern" values={feature.solutionPattern} />
              <TagsRow label="Tech / stack" values={feature.techStack} />
            </dl>
          </section>

          <section className="fd-group" aria-labelledby="fd-reuse">
            <h2 id="fd-reuse" className="fd-group__title">
              Reuse &amp; provenance
            </h2>
            <dl className="fd-fields">
              <TextRow label="How to reuse" value={feature.howToReuse} />
              <LinkRow label="Demo URL" href={feature.demoUrl} />
              <LinkRow label="Repo / component URL" href={feature.repoUrl} />
              <TextRow label="Owner" value={feature.owner} />
            </dl>
          </section>

          <section className="fd-group" aria-labelledby="fd-governance">
            <h2 id="fd-governance" className="fd-group__title">
              Governance
            </h2>
            <dl className="fd-fields">
              <TextRow label="Maturity" value={feature.maturity} />
              <TextRow label="Data classification" value={feature.dataClassification ?? ''} />
              <TagsRow label="Compliance flags" values={feature.complianceFlags} />
            </dl>
          </section>

          <section className="fd-group" aria-labelledby="fd-identity">
            <h2 id="fd-identity" className="fd-group__title">
              Identity
            </h2>
            <dl className="fd-fields">
              <TextRow label="Record ID" value={feature.id} />
            </dl>
          </section>
        </div>

        <aside className="fd-side" aria-label="Attachments and relationships">
          <AttachmentsCard recordId={feature.id} />
          <RelationshipsCard recordId={feature.id} workspaceId={feature.workspaceId} />
        </aside>
      </div>
    </main>
  );
}

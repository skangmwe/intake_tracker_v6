// Shared card fragments for the advanced views (Slice 24). Badges, tags, and meta pairs render the same
// way on a Kanban card, a gallery card, and a timeline/agenda entry, so they live here once.

import type { RecordViewBadge, RecordViewItem } from './types';

const BADGE_TONE_CLASS: Record<NonNullable<RecordViewBadge['tone']>, string> = {
  neutral: 'rv-badge--neutral',
  info: 'rv-badge--info',
  success: 'rv-badge--success',
  warning: 'rv-badge--warning',
  error: 'rv-badge--error',
};

export function Badges({ badges }: { badges: RecordViewBadge[] | undefined }) {
  if (!badges || badges.length === 0) return null;
  return (
    <div className="rv-card__badges">
      {badges.map((badge, index) => (
        <span
          key={`${badge.label}-${index}`}
          className={`rv-badge ${BADGE_TONE_CLASS[badge.tone ?? 'neutral']}`}
          data-ds="badge"
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}

export function Tags({ tags }: { tags: string[] | undefined }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="rv-card__tags">
      {tags.map((tag, index) => (
        <span key={`${tag}-${index}`} className="rv-card__tag">
          {tag}
        </span>
      ))}
    </div>
  );
}

export function MetaList({ meta }: { meta: RecordViewItem['meta'] }) {
  if (!meta || meta.length === 0) return null;
  return (
    <dl className="rv-card__meta">
      {meta.map((pair, index) => (
        <div key={`${pair.label}-${index}`} className="rv-card__meta-row">
          <dt className="rv-card__meta-label">{pair.label}</dt>
          <dd className="rv-card__meta-value">{pair.value}</dd>
        </div>
      ))}
    </dl>
  );
}

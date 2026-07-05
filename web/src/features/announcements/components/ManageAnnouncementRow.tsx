// One row in the admin manage list (S23) — title + status/pinned/published meta on the left, the
// lifecycle actions on the right. Publish shows only for a Draft; Retire for anything not yet Retired.
// Memoised as a list-item component (web-component-architecture.md).

import { memo } from 'react';
import { Link } from 'react-router-dom';
import { PushPin } from '@phosphor-icons/react';
import type { AnnouncementListRow } from '@shared/types';

import { Button } from '@/shared/components/Button';

import { AnnouncementStatusBadge } from './AnnouncementStatusBadge';

interface ManageAnnouncementRowProps {
  row: AnnouncementListRow;
  busy: boolean;
  onEdit: (id: string) => void;
  onPublish: (id: string) => void;
  onRetire: (id: string) => void;
}

function ManageAnnouncementRowComponent({ row, busy, onEdit, onPublish, onRetire }: ManageAnnouncementRowProps) {
  const published = row.publishedAt
    ? new Date(row.publishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  return (
    <li className="ann-row" data-ds="card">
      <div className="ann-row__main">
        <div className="ann-row__title-line">
          <span className="ann-row__title">{row.title}</span>
          {row.pinned && (
            <span className="ann-row__pin">
              <PushPin size={14} weight="regular" aria-hidden />
              Pinned
            </span>
          )}
        </div>
        <p className="ann-row__snippet">{row.bodySnippet}</p>
        <div className="ann-row__meta">
          <AnnouncementStatusBadge status={row.status} />
          <span className="caption">Published {published}</span>
        </div>
      </div>
      <div className="ann-row__actions">
        <Link className="mws-link" to={`/announcements/${row.id}`}>
          Preview
        </Link>
        <Button variant="secondary" compact onClick={() => onEdit(row.id)} disabled={busy || row.status === 'Retired'}>
          Edit
        </Button>
        {row.status === 'Draft' && (
          <Button compact onClick={() => onPublish(row.id)} disabled={busy}>
            Publish
          </Button>
        )}
        {row.status !== 'Retired' && (
          <Button variant="secondary" compact onClick={() => onRetire(row.id)} disabled={busy}>
            Retire
          </Button>
        )}
      </div>
    </li>
  );
}

export const ManageAnnouncementRow = memo(ManageAnnouncementRowComponent);

// S26 Drafts — the caller's personal, discardable intake drafts. Resume opens the intake form
// prefilled; Discard hard-deletes. Deferred surface built minimally in slice 5 (data-model.md §Draft).

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import type { DraftId, WorkspaceId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { useMe } from '@/features/users/useMe';

import { useDeleteDraft, useDrafts } from '../useDrafts';
import { resolveActiveWorkspaceId } from '../workspace';
import { problemMessage } from '../problemMessage';

function formatEdited(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function DraftsPage() {
  const navigate = useNavigate();
  const { data: me, isLoading: isMeLoading, isError: isMeError } = useMe();
  const workspaceId = useMemo(() => resolveActiveWorkspaceId(me?.memberships), [me]);

  const { data: drafts, isLoading, isError, error } = useDrafts(workspaceId ?? undefined);
  const deleteDraft = useDeleteDraft((workspaceId ?? '') as WorkspaceId);

  if (isMeLoading || isLoading) {
    return (
      <main className="requests-page">
        <h1 className="h1">Drafts</h1>
        <p className="caption" role="status">
          Loading your drafts…
        </p>
      </main>
    );
  }

  if (isMeError || isError || !workspaceId) {
    return (
      <main className="requests-page">
        <h1 className="h1">Drafts</h1>
        <p className="mws-alert mws-alert--error" role="alert">
          {problemMessage(error, 'Your drafts could not be loaded. Try again in a moment.')}
        </p>
      </main>
    );
  }

  const rows = drafts ?? [];

  return (
    <main className="requests-page">
      <div className="requests-page__head">
        <h1 className="h1">Drafts</h1>
        <Button variant="primary" onClick={() => navigate('/requests/new')}>
          New request
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="requests-empty" data-ds="empty-filtered">
          <p className="body">No drafts yet.</p>
          <p className="caption">
            A draft is saved when you choose “Save draft” on the intake form. It stays private to you until
            you submit it.
          </p>
        </div>
      ) : (
        <ul className="drafts-list" aria-label="Your drafts">
          {rows.map((draft) => (
            <li key={draft.id} className="drafts-list__row">
              <div className="drafts-list__meta">
                <span className="drafts-list__title">{draft.title || 'Untitled request'}</span>
                <span className="caption">Last edited {formatEdited(draft.lastEditedAt)}</span>
              </div>
              <div className="drafts-list__actions">
                <Button variant="secondary" compact onClick={() => navigate(`/requests/new?draftId=${draft.id}`)}>
                  Resume
                </Button>
                <Button
                  variant="secondary"
                  compact
                  onClick={() => deleteDraft.mutate(draft.id as DraftId)}
                  disabled={deleteDraft.isPending}
                >
                  Discard
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

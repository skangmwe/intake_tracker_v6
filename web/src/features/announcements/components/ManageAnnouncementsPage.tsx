// Manage announcements (S23) — a workspace admin's authoring surface. Lists the workspace's
// announcements across all statuses, creates new Drafts, edits until Retired, and publishes / retires.
// Resolves the active workspace from the caller's WorkspaceAdmin memberships (like the Lifecycle page),
// with a selector when they administer more than one. Renders explicit loading / error / empty states
// (web-component-architecture.md).

import { useMemo, useState } from 'react';
import type { AnnouncementPatchRequest, WorkspaceId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { useMe } from '@/features/users/useMe';

import { problemMessage } from '../problemMessage';
import {
  useAnnouncement,
  useCreateAnnouncement,
  useManagedAnnouncements,
  usePublishAnnouncement,
  useRetireAnnouncement,
  useUpdateAnnouncement,
} from '../useAnnouncements';
import { AnnouncementEditor } from './AnnouncementEditor';
import { ManageAnnouncementRow } from './ManageAnnouncementRow';

type EditorState = { mode: 'create' } | { mode: 'edit'; id: string } | null;

export function ManageAnnouncementsPage() {
  const { data: me, isLoading: isMeLoading, isError: isMeError } = useMe();
  const adminMemberships = useMemo(
    () => (me?.memberships ?? []).filter((membership) => membership.level === 'WorkspaceAdmin'),
    [me],
  );

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<WorkspaceId | null>(null);
  const workspaceId = selectedWorkspaceId ?? adminMemberships[0]?.workspaceId ?? null;
  const wsId = (workspaceId ?? '') as WorkspaceId;

  const list = useManagedAnnouncements(workspaceId ?? undefined, 1);
  const create = useCreateAnnouncement(wsId);
  const update = useUpdateAnnouncement(wsId);
  const publish = usePublishAnnouncement(wsId);
  const retire = useRetireAnnouncement(wsId);

  const [editor, setEditor] = useState<EditorState>(null);
  const editingDetail = useAnnouncement(editor?.mode === 'edit' ? editor.id : undefined);

  const busy = create.isPending || update.isPending || publish.isPending || retire.isPending;
  const closeEditor = () => setEditor(null);

  const submitEditor = (value: { title: string; body: string; audience: AnnouncementPatchRequest['audience']; pinned: boolean; expiresOn?: string }) => {
    const expiry = value.expiresOn ? { expiresOn: value.expiresOn } : {};
    if (editor?.mode === 'edit') {
      update.mutate(
        { id: editor.id, request: { title: value.title, body: value.body, audience: value.audience, pinned: value.pinned, ...expiry } },
        { onSuccess: closeEditor },
      );
    } else {
      create.mutate(
        { title: value.title, body: value.body, audience: value.audience, pinned: value.pinned, ...expiry },
        { onSuccess: closeEditor },
      );
    }
  };

  if (isMeLoading && !me) {
    return <p className="caption" role="status">Loading your workspaces…</p>;
  }
  if (isMeError && !me) {
    return <p className="mws-alert mws-alert--error" role="alert">We couldn’t load your access. Try again in a moment.</p>;
  }
  if (adminMemberships.length === 0 || workspaceId === null) {
    return (
      <section className="mws-empty mws-empty--zero" aria-labelledby="ann-no-access">
        <h1 id="ann-no-access" className="h2">Manage announcements</h1>
        <p className="body">You need to be a workspace admin to post announcements. Ask an admin for access.</p>
      </section>
    );
  }

  const items = list.data?.items ?? [];
  const mutationError = create.isError
    ? problemMessage(create.error)
    : update.isError
      ? problemMessage(update.error)
      : null;

  return (
    <div className="ann-page">
      <header className="ann-page__header">
        <div>
          <h1 className="h2">Manage announcements</h1>
          <p className="body">Post notices to your workspace. Published announcements appear in everyone’s bell.</p>
        </div>
        <Button onClick={() => setEditor({ mode: 'create' })} disabled={busy}>
          New announcement
        </Button>
      </header>

      {adminMemberships.length > 1 && (
        <label className="mws-field">
          <span className="caption">Workspace</span>
          <select
            className="mws-select"
            data-ds="select"
            value={workspaceId}
            onChange={(event) => setSelectedWorkspaceId(event.target.value as WorkspaceId)}
          >
            {adminMemberships.map((membership) => (
              <option key={membership.workspaceId} value={membership.workspaceId}>
                {membership.workspaceName}
              </option>
            ))}
          </select>
        </label>
      )}

      {list.isLoading && <p className="caption" role="status">Loading announcements…</p>}
      {list.isError && (
        <p className="mws-alert mws-alert--error" role="alert">We couldn’t load announcements. Try again in a moment.</p>
      )}
      {(publish.isError || retire.isError) && (
        <p className="mws-alert mws-alert--error" role="alert">{problemMessage(publish.error ?? retire.error)}</p>
      )}

      {list.data && items.length === 0 && (
        <section className="mws-empty mws-empty--zero" aria-labelledby="ann-empty">
          <h2 id="ann-empty" className="h3">No announcements yet</h2>
          <p className="body">Create your first announcement to share news with your workspace.</p>
          <Button onClick={() => setEditor({ mode: 'create' })}>Create your first announcement</Button>
        </section>
      )}

      {items.length > 0 && (
        <ul className="ann-list">
          {items.map((row) => (
            <ManageAnnouncementRow
              key={row.id}
              row={row}
              busy={busy}
              onEdit={(id) => setEditor({ mode: 'edit', id })}
              onPublish={(id) => publish.mutate(id)}
              onRetire={(id) => retire.mutate(id)}
            />
          ))}
        </ul>
      )}

      {editor?.mode === 'create' && (
        <AnnouncementEditor
          mode="create"
          submitting={create.isPending}
          errorMessage={mutationError}
          onSubmit={submitEditor}
          onClose={closeEditor}
        />
      )}
      {editor?.mode === 'edit' && editingDetail.data && (
        <AnnouncementEditor
          key={editor.id}
          mode="edit"
          initial={editingDetail.data}
          submitting={update.isPending}
          errorMessage={mutationError}
          onSubmit={submitEditor}
          onClose={closeEditor}
        />
      )}
    </div>
  );
}

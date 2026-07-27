// Manage announcements (S23) — a workspace admin's authoring surface, reconciled to the prototype: an
// ANNOUNCEMENT · POSTED BY · POSTED · STATUS table (funnel + sort + footer) plus a create/edit modal.
// Resolves the active workspace from the caller's WorkspaceAdmin memberships (like the Lifecycle page),
// with a selector when they administer more than one. Renders explicit loading / error / empty states
// (web-component-architecture.md). The list is sorted / filtered / paginated client-side.
//
// Justification for exceeding the 200-line component guideline (web-component-architecture.md — route
// components may extend to 250 lines): this is the route component that composes the table, the footer,
// the editor modal, workspace resolution, the client-side view state, and the create/update wiring. The
// presentational pieces (table, editor) are already extracted; what remains is orchestration.

import { useMemo, useState } from 'react';
import type { AnnouncementAudience, WorkspaceId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import type { SelectOption } from '@/shared/components/Form';
import { type FilterValue, type SortState, TableFooter } from '@/shared/components/Table';
import { useActiveWorkspaceId } from '@/shared/workspace/ActiveWorkspaceContext';
import { useMe } from '@/features/users/useMe';
import { useMembers } from '@/features/users/useMembers';

import { problemMessage } from '../problemMessage';
import { type AnnouncementsFilters, selectAnnouncementsView } from '../announcementsView';
import { MANAGE_ANNOUNCEMENTS_PAGE_SIZE } from '../constants';
import {
  useAnnouncement,
  useCreateAnnouncement,
  useManagedAnnouncements,
  useUpdateAnnouncement,
} from '../useAnnouncements';
import { AnnouncementEditor, type EditorValue } from './AnnouncementEditor';
import { AnnouncementsManageTable } from './AnnouncementsManageTable';
import { ArchiveAnnouncementDialog } from './ArchiveAnnouncementDialog';

type EditorState = { mode: 'create' } | { mode: 'edit'; id: string } | null;

const EVERYONE_AUDIENCE: AnnouncementAudience = { kind: 'everyone' };
const NO_FILTERS: AnnouncementsFilters = {};

export function ManageAnnouncementsPage() {
  const { data: me, isLoading: isMeLoading, isError: isMeError } = useMe();

  // Scope to the workspace the admin is in (the active workspace), mirroring WorkspaceAuditPage —
  // not a picker across every workspace they administer. Posting is offered only when the caller is a
  // WorkspaceAdmin of that active workspace.
  const workspaceId = useActiveWorkspaceId();
  const isActiveWorkspaceAdmin = useMemo(
    () =>
      (me?.memberships ?? []).some(
        (membership) =>
          membership.workspaceId === workspaceId && membership.level === 'WorkspaceAdmin',
      ),
    [me, workspaceId],
  );
  const wsId = (workspaceId ?? '') as WorkspaceId;

  const list = useManagedAnnouncements(workspaceId ?? undefined);
  const members = useMembers(workspaceId ?? undefined);
  const create = useCreateAnnouncement(wsId);
  const update = useUpdateAnnouncement(wsId);

  const [sort, setSort] = useState<SortState | undefined>(undefined);
  const [filters, setFilters] = useState<AnnouncementsFilters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<EditorState>(null);
  const [toArchive, setToArchive] = useState<{ id: string; title: string } | null>(null);
  const editingDetail = useAnnouncement(editor?.mode === 'edit' ? editor.id : undefined);

  const allRows = useMemo(() => list.data?.items ?? [], [list.data]);
  const view = useMemo(
    () => selectAnnouncementsView(allRows, sort, filters, page, MANAGE_ANNOUNCEMENTS_PAGE_SIZE),
    [allRows, sort, filters, page],
  );
  const authorOptions: SelectOption[] = useMemo(
    () =>
      (members.data?.members ?? [])
        .filter((member) => member.userId && member.status !== 'Invited')
        .map((member) => ({
          value: member.userId as string,
          label: member.displayName ?? member.email,
        })),
    [members.data],
  );

  const busy = create.isPending || update.isPending;
  const closeEditor = () => setEditor(null);

  const onSortChange = (next: SortState | undefined) => {
    setSort(next);
    setPage(1);
  };
  const onFilterChange = (value: FilterValue) => {
    setFilters(value.contains?.trim() || value.values?.length ? { title: value } : NO_FILTERS);
    setPage(1);
  };
  const clearFilters = () => {
    setFilters(NO_FILTERS);
    setPage(1);
  };

  const submitEditor = (value: EditorValue) => {
    const optional = {
      status: value.status,
      autoArchive: value.autoArchive,
      ...(value.author ? { author: value.author } : {}),
      ...(value.scheduledPublishAt ? { scheduledPublishAt: value.scheduledPublishAt } : {}),
    };
    if (editor?.mode === 'edit') {
      const audience = editingDetail.data?.audience ?? EVERYONE_AUDIENCE;
      update.mutate(
        {
          id: editor.id,
          request: {
            title: value.title,
            body: value.body,
            audience,
            pinned: value.pinned,
            ...optional,
          },
        },
        { onSuccess: closeEditor },
      );
    } else {
      create.mutate(
        {
          title: value.title,
          body: value.body,
          audience: EVERYONE_AUDIENCE,
          pinned: value.pinned,
          ...optional,
        },
        { onSuccess: closeEditor },
      );
    }
  };

  if (isMeLoading && !me) {
    return (
      <p className="caption" role="status">
        Loading your workspaces…
      </p>
    );
  }
  if (isMeError && !me) {
    return (
      <p className="mws-alert mws-alert--error" role="alert">
        We couldn’t load your access. Try again in a moment.
      </p>
    );
  }
  if (workspaceId === null || !isActiveWorkspaceAdmin) {
    return (
      <section className="mws-empty mws-empty--zero">
        <p className="body">
          You need to be a workspace admin to post announcements. Ask an admin for access.
        </p>
      </section>
    );
  }

  const mutationError = create.isError
    ? problemMessage(create.error)
    : update.isError
      ? problemMessage(update.error)
      : null;

  return (
    <div className="ann-page">
      {/* The surface title + lead render in the shared SideNavLayout header; the primary action
          (New announcement) stays here, aligned to the end of its row. */}
      <header className="ann-page__header">
        <Button onClick={() => setEditor({ mode: 'create' })} disabled={busy}>
          New announcement
        </Button>
      </header>

      {list.isLoading && (
        <p className="caption" role="status">
          Loading announcements…
        </p>
      )}
      {list.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          We couldn’t load announcements. Try again in a moment.
        </p>
      )}

      {list.data && allRows.length === 0 && (
        <section className="mws-empty mws-empty--zero" aria-labelledby="ann-empty">
          <h2 id="ann-empty" className="h3">
            No announcements yet
          </h2>
          <p className="body">Create your first announcement to share news with your workspace.</p>
          <Button onClick={() => setEditor({ mode: 'create' })}>
            Create your first announcement
          </Button>
        </section>
      )}

      {list.data && allRows.length > 0 && view.total === 0 && (
        <div className="ann-no-matches">
          <p className="ann-no-matches__title">No announcements match your filter</p>
          <Button variant="secondary" compact onClick={clearFilters}>
            Clear filter
          </Button>
        </div>
      )}

      {list.data && view.total > 0 && (
        <>
          <AnnouncementsManageTable
            rows={view.rows}
            sort={sort}
            onSortChange={onSortChange}
            filters={filters}
            onFilterChange={onFilterChange}
            onOpen={(row) => setEditor({ mode: 'edit', id: row.id })}
          />
          <TableFooter
            page={Math.min(page, view.totalPages)}
            totalPages={view.totalPages}
            total={view.total}
            start={view.start}
            end={view.end}
            noun="announcements"
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(view.totalPages, prev + 1))}
          />
        </>
      )}

      {editor?.mode === 'create' && (
        <AnnouncementEditor
          mode="create"
          authorOptions={authorOptions}
          defaultAuthor={me?.user.id}
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
          authorOptions={authorOptions}
          defaultAuthor={me?.user.id}
          submitting={update.isPending}
          errorMessage={mutationError}
          onSubmit={submitEditor}
          onClose={closeEditor}
          onArchive={() => {
            setToArchive({ id: editor.id, title: editingDetail.data?.title ?? '' });
            closeEditor();
          }}
        />
      )}

      <ArchiveAnnouncementDialog
        announcement={toArchive}
        workspaceId={wsId}
        onClose={() => setToArchive(null)}
      />
    </div>
  );
}

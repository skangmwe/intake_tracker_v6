// Platform → Announcements (platform-admin only). Mirrors the workspace manage page but posts across
// workspaces: a broadcast fans out one per-workspace announcement per target, and the list groups the
// copies to one row (BROADCAST · POSTED BY · POSTED · WORKSPACES · STATUS). The editor adds a target
// picker (All / specific); edit changes content across every copy; retire archives every copy. The three
// non-data states (loading / error / empty) render explicitly (web-component-architecture.md).
//
// Justification for exceeding the 200-line component guideline (route components may extend to 250): this
// is the route component composing the table, footer, editor modal, retire confirm, and the create/update/
// retire wiring. The presentational pieces (table, editor) are already extracted.

import { useMemo, useState } from 'react';

import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Disclosure';
import { type FilterValue, type SortState, TableFooter } from '@/shared/components/Table';
import { PlatformGate } from '@/features/platform-admin/components/PlatformGate';

import { problemMessage } from '../problemMessage';
import { type AnnouncementsFilters, selectAnnouncementsView } from '../announcementsView';
import { MANAGE_ANNOUNCEMENTS_PAGE_SIZE } from '../constants';
import {
  useCreatePlatformBroadcast,
  usePlatformAnnouncements,
  usePlatformWorkspaces,
  useRetirePlatformBroadcast,
  useUpdatePlatformBroadcast,
} from '../usePlatformAnnouncements';
import { PlatformBroadcastEditor, type PlatformEditorValue } from './PlatformBroadcastEditor';
import { PlatformBroadcastsTable } from './PlatformBroadcastsTable';

type EditorState = { mode: 'create' } | { mode: 'edit'; broadcastId: string } | null;

const NO_FILTERS: AnnouncementsFilters = {};

export function PlatformAnnouncementsPage() {
  const workspaces = usePlatformWorkspaces();
  const list = usePlatformAnnouncements();
  const create = useCreatePlatformBroadcast();
  const update = useUpdatePlatformBroadcast();
  const retire = useRetirePlatformBroadcast();

  const [sort, setSort] = useState<SortState | undefined>(undefined);
  const [filters, setFilters] = useState<AnnouncementsFilters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<EditorState>(null);
  const [toRetire, setToRetire] = useState<{ broadcastId: string; title: string } | null>(null);

  const allRows = useMemo(() => list.data?.items ?? [], [list.data]);
  const view = useMemo(
    () => selectAnnouncementsView(allRows, sort, filters, page, MANAGE_ANNOUNCEMENTS_PAGE_SIZE),
    [allRows, sort, filters, page],
  );
  const editing = useMemo(
    () => (editor?.mode === 'edit' ? allRows.find((row) => row.broadcastId === editor.broadcastId) : undefined),
    [editor, allRows],
  );
  const totalWorkspaces = workspaces.data?.length ?? 0;

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

  const submitEditor = (value: PlatformEditorValue) => {
    const optional = {
      status: value.status,
      autoArchive: value.autoArchive,
      ...(value.scheduledPublishAt ? { scheduledPublishAt: value.scheduledPublishAt } : {}),
    };
    if (editor?.mode === 'edit') {
      update.mutate(
        {
          broadcastId: editor.broadcastId,
          request: { title: value.title, body: value.body, pinned: value.pinned, ...optional },
        },
        { onSuccess: closeEditor },
      );
    } else {
      create.mutate(
        { title: value.title, body: value.body, pinned: value.pinned, target: value.target, ...optional },
        { onSuccess: closeEditor },
      );
    }
  };

  const mutationError = create.isError
    ? problemMessage(create.error)
    : update.isError
      ? problemMessage(update.error)
      : null;

  return (
    <PlatformGate>
      <div className="ann-page">
        <header className="ann-page__header">
          <Button onClick={() => setEditor({ mode: 'create' })} disabled={busy}>
            New broadcast
          </Button>
        </header>

        {list.isLoading && (
          <p className="caption" role="status">
            Loading broadcasts…
          </p>
        )}
        {list.isError && (
          <p className="mws-alert mws-alert--error" role="alert">
            We couldn’t load broadcasts. Try again in a moment.
          </p>
        )}

        {list.data && allRows.length === 0 && (
          <section className="mws-empty mws-empty--zero" aria-labelledby="plat-ann-empty">
            <h2 id="plat-ann-empty" className="h3">
              No broadcasts yet
            </h2>
            <p className="body">Post a notice to every workspace or specific ones.</p>
            <Button onClick={() => setEditor({ mode: 'create' })}>Create your first broadcast</Button>
          </section>
        )}

        {list.data && allRows.length > 0 && view.total === 0 && (
          <div className="ann-no-matches">
            <p className="ann-no-matches__title">No broadcasts match your filter</p>
            <Button variant="secondary" compact onClick={clearFilters}>
              Clear filter
            </Button>
          </div>
        )}

        {list.data && view.total > 0 && (
          <>
            <PlatformBroadcastsTable
              rows={view.rows}
              totalWorkspaces={totalWorkspaces}
              sort={sort}
              onSortChange={onSortChange}
              filters={filters}
              onFilterChange={onFilterChange}
              onOpen={(row) => setEditor({ mode: 'edit', broadcastId: row.broadcastId })}
            />
            <TableFooter
              page={Math.min(page, view.totalPages)}
              totalPages={view.totalPages}
              total={view.total}
              start={view.start}
              end={view.end}
              noun="broadcasts"
              onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
              onNext={() => setPage((prev) => Math.min(view.totalPages, prev + 1))}
            />
          </>
        )}

        {editor?.mode === 'create' && (
          <PlatformBroadcastEditor
            mode="create"
            workspaces={workspaces.data ?? []}
            submitting={create.isPending}
            errorMessage={mutationError}
            onSubmit={submitEditor}
            onClose={closeEditor}
          />
        )}
        {editor?.mode === 'edit' && editing && (
          <PlatformBroadcastEditor
            key={editor.broadcastId}
            mode="edit"
            initial={editing}
            workspaces={workspaces.data ?? []}
            submitting={update.isPending}
            errorMessage={mutationError}
            onSubmit={submitEditor}
            onClose={closeEditor}
            onRetire={() => {
              setToRetire({ broadcastId: editor.broadcastId, title: editing.title });
              closeEditor();
            }}
          />
        )}

        {toRetire && (
          <Modal
            title="Retire this broadcast?"
            onClose={() => setToRetire(null)}
            footer={
              <>
                <Button variant="secondary" onClick={() => setToRetire(null)} disabled={retire.isPending}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={retire.isPending}
                  onClick={() =>
                    retire.mutate(toRetire.broadcastId, { onSuccess: () => setToRetire(null) })
                  }
                >
                  {retire.isPending ? 'Retiring…' : 'Retire broadcast'}
                </Button>
              </>
            }
          >
            <p className="body">
              “{toRetire.title}” will be archived in every workspace it was posted to. This can’t be
              undone.
            </p>
            {retire.isError && (
              <p className="mws-alert mws-alert--error" role="alert">
                {problemMessage(retire.error)}
              </p>
            )}
          </Modal>
        )}
      </div>
    </PlatformGate>
  );
}

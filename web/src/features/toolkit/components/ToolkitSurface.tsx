// S43 Toolkit surface — the Reference → Toolkit page. Search + gallery/list toggle + count + New
// item, over an access-respecting, server-filtered/sorted list. The row/card opens a detail side
// sheet; New item and Edit open the editor side sheet. Prototype-styled; reuses the shared Table,
// EdgeStates, and Button primitives.

import { useMemo, useState, type ReactNode } from 'react';
import { MagnifyingGlass, Plus, Toolbox } from '@phosphor-icons/react';

import type {
  FilterClause,
  ToolkitItemDto,
  ToolkitItemId,
  ToolkitItemListRow,
  ToolkitQuery,
} from '@shared/types';

import { Button } from '@/shared/components/Button';
import { EmptyListFilteredToZero, EmptyListZeroData } from '@/shared/components/EdgeStates';
import {
  FilterFunnel,
  TableFooter,
  type FilterType,
  type FilterValue,
  type SortState,
  type TableColumn,
} from '@/shared/components/Table';
import { ViewModeToggle } from '@/shared/components/RecordViews';
import { SEARCH_DEBOUNCE_MS } from '@/shared/constants';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { useMe } from '@/features/users/useMe';
import { resolveActiveWorkspaceId } from '@/features/requests/workspace';

import { TOOLKIT_KINDS, TOOLKIT_STATUSES } from '../toolkitFormat';
import { useToolkitList } from '../useToolkit';
import { ToolkitDetailSheet } from './ToolkitDetailSheet';
import { ToolkitEditorSheet } from './ToolkitEditorSheet';
import { ToolkitGallery } from './ToolkitGallery';
import { ToolkitList } from './ToolkitList';
import '../toolkit.css';

const PAGE_SIZE = 20;
// The gallery drops pagination and scrolls the whole page, so it loads the full set in one request —
// up to the API's maximum page size (100). Beyond that a catalog would need infinite scroll.
const GALLERY_PAGE_SIZE = 100;

const FILTER_TYPES: Record<string, FilterType> = {
  name: 'text',
  kind: 'select',
  status: 'select',
  maintainer: 'select',
};

type EditorState = { editItemId: ToolkitItemId | null } | null;

function filterValueToClause(value: FilterValue): FilterClause | undefined {
  if (value.kind === 'select') {
    return value.values && value.values.length > 0 ? { kind: 'select', values: value.values } : undefined;
  }
  if (value.kind === 'text') {
    return value.contains && value.contains.trim() ? { kind: 'text', contains: value.contains.trim() } : undefined;
  }
  return undefined;
}

function clauseToFilterValue(clause: FilterClause | undefined): FilterValue | undefined {
  if (!clause) return undefined;
  if (clause.kind === 'select') return { kind: 'select', values: clause.values };
  if (clause.kind === 'text') return { kind: 'text', contains: clause.contains };
  return undefined;
}

function maintainerOptions(rows: ToolkitItemListRow[]) {
  const seen = new Set<string>();
  for (const row of rows) if (row.maintainer) seen.add(row.maintainer);
  return [...seen].map((value) => ({ value, label: value }));
}

export function ToolkitSurface() {
  const { data: me } = useMe();
  const workspaceId = useMemo(() => resolveActiveWorkspaceId(me?.memberships), [me]);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const [columnFilters, setColumnFilters] = useState<Record<string, FilterClause>>({});
  const [viewMode, setViewMode] = useState<'gallery' | 'table'>('gallery');
  const [sort, setSort] = useState<SortState | undefined>({ column: 'lastModifiedAt', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [openItemId, setOpenItemId] = useState<ToolkitItemId | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);

  const filters = useMemo<Record<string, FilterClause>>(() => {
    const next: Record<string, FilterClause> = { ...columnFilters };
    if (debouncedSearch.trim()) next.search = { kind: 'text', contains: debouncedSearch.trim() };
    return next;
  }, [columnFilters, debouncedSearch]);

  const query = useMemo<ToolkitQuery>(() => {
    const isGallery = viewMode === 'gallery';
    const built: ToolkitQuery = {
      page: isGallery ? 1 : page,
      pageSize: isGallery ? GALLERY_PAGE_SIZE : PAGE_SIZE,
    };
    if (Object.keys(filters).length > 0) built.filters = filters;
    if (sort) built.sort = [{ column: sort.column, direction: sort.direction }];
    return built;
  }, [viewMode, page, filters, sort]);

  const { data, isLoading, isError } = useToolkitList(workspaceId, query);
  const rows = data?.items ?? [];
  const total = data?.totalCount ?? 0;
  // "Has filters" ignores the top search so the zero-data ceremony still shows on an empty catalog.
  const hasColumnFilters = Object.keys(columnFilters).length > 0 || Boolean(debouncedSearch.trim());

  const applyFilter = (key: string, value: FilterValue) => {
    const clause = filterValueToClause(value);
    setColumnFilters((prev) => {
      const nextFilters = { ...prev };
      if (clause) nextFilters[key] = clause;
      else delete nextFilters[key];
      return nextFilters;
    });
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  const renderFilter = (column: TableColumn): ReactNode => {
    const type = FILTER_TYPES[column.key];
    if (!type) return null;
    const options =
      column.key === 'kind'
        ? TOOLKIT_KINDS.map((kind) => ({ value: kind, label: kind }))
        : column.key === 'status'
          ? TOOLKIT_STATUSES.map((status) => ({ value: status, label: status }))
          : column.key === 'maintainer'
            ? maintainerOptions(rows)
            : undefined;
    return (
      <FilterFunnel
        type={type}
        columnLabel={column.label}
        value={clauseToFilterValue(columnFilters[column.key])}
        onChange={(value) => applyFilter(column.key, value)}
        options={options}
      />
    );
  };

  const onSaved = (item: ToolkitItemDto) => {
    setEditor(null);
    setOpenItemId(item.id);
  };

  return (
    <main
      className={`toolkit-surface list-surface${viewMode === 'gallery' ? ' list-surface--flow' : ''}`}
      data-layout="wide"
    >
      <header className="toolkit-surface__head">
        <h1 className="h1">Toolkit</h1>
        <p className="toolkit-surface__lede">
          Playbooks, plugins, and prompt templates the team reaches for during delivery. Reuse a vetted
          asset instead of starting from scratch.
        </p>
      </header>

      <div className="toolkit-surface__toolbar">
        <span className="tk-search">
          <MagnifyingGlass size={16} weight="regular" aria-hidden className="tk-search__icon" />
          <input
            type="search"
            className="tk-search__input"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search the toolkit"
            aria-label="Search the toolkit"
          />
        </span>
        <span className="toolkit-surface__spacer" />
        <ViewModeToggle
          available={['table', 'gallery']}
          active={viewMode}
          onChange={(kind) => setViewMode(kind === 'table' ? 'table' : 'gallery')}
          label="Toolkit view"
          iconOnly
        />
        <Button variant="primary" onClick={() => setEditor({ editItemId: null })}>
          <Plus size={16} weight="regular" aria-hidden /> New item
        </Button>
      </div>

      <div className="toolkit-surface__body list-surface__body">
        {isLoading ? (
          <p className="caption" role="status">
            Loading toolkit…
          </p>
        ) : isError ? (
          <p className="mws-alert mws-alert--error" role="alert">
            The toolkit could not be loaded. Try again in a moment.
          </p>
        ) : rows.length === 0 ? (
          hasColumnFilters ? (
            <EmptyListFilteredToZero
              onClearFilters={() => {
                setColumnFilters({});
                setSearch('');
                setPage(1);
              }}
            />
          ) : (
            <EmptyListZeroData
              icon={Toolbox}
              title="No toolkit items yet"
              message="Add a playbook, plugin, or prompt so the team can reuse a vetted asset."
              action={
                <Button variant="primary" onClick={() => setEditor({ editItemId: null })}>
                  Add your first item
                </Button>
              }
            />
          )
        ) : (
          <>
            {viewMode === 'gallery' ? (
              <ToolkitGallery items={rows} onOpen={(id) => setOpenItemId(id)} />
            ) : (
              <ToolkitList
                rows={rows}
                sort={sort}
                onSortChange={(next) => {
                  setSort(next);
                  setPage(1);
                }}
                renderFilter={renderFilter}
                onOpen={(id) => setOpenItemId(id)}
              />
            )}
            {viewMode !== 'gallery' && (
              <TableFooter
                page={page}
                totalPages={totalPages}
                total={total}
                start={start}
                end={end}
                noun="items"
                onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
                onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              />
            )}
          </>
        )}
      </div>

      {openItemId && !editor && (
        <ToolkitDetailSheet
          itemId={openItemId}
          onClose={() => setOpenItemId(null)}
          onEdit={(item) => {
            setOpenItemId(null);
            setEditor({ editItemId: item.id });
          }}
        />
      )}

      {editor && workspaceId && (
        <ToolkitEditorSheet
          workspaceId={workspaceId}
          editItemId={editor.editItemId}
          onClose={() => setEditor(null)}
          onSaved={onSaved}
        />
      )}
    </main>
  );
}

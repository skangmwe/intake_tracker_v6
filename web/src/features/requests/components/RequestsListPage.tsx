// S2 Requests list — the access-respecting items-grid. Composes the shared Table primitives
// (TableShell, ViewBar, SavedViewPicker, FilterFunnel) over useRequestsList. Filtering/sorting/
// paging are server-side; this page owns the view/filter/sort/page state and translates between
// the FilterFunnel value shape and the query FilterClause shape. Prototype is authoritative.

import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { DownloadSimple, FilePlus, LinkSimple } from '@phosphor-icons/react';

import type { FilterClause, PaginatedQuery, RequestListRow, SavedViewDto, SlaStatus } from '@shared/types';

import { Button } from '@/shared/components/Button';
import {
  FilterFunnel,
  GalleryFilterBar,
  SavedViewPicker,
  TableFooter,
  TableShell,
  ViewBar,
  type ActiveFilterPill,
  type FilterType,
  type FilterValue,
  type SavedView,
  type SortState,
  type TableColumn,
  type TableRow,
} from '@/shared/components/Table';
import {
  KanbanView,
  ViewModeToggle,
  type RecordViewItem,
  type RecordViewKind,
} from '@/shared/components/RecordViews';
import { agingTintClass } from '@/shared/components/Feedback';
import { EmptyListFilteredToZero, EmptyListZeroData } from '@/shared/components/EdgeStates';
import { useMe } from '@/features/users/useMe';
import {
  SavedViewEditor,
  toPickerView,
  useSavedViews,
  type ColumnOption,
} from '@/features/saved-views';
import { useExportView } from '@/features/import-export';
import { useLifecycleConfig } from '@/features/lifecycle';

import { useRequestsList } from '../useRequests';
import { resolveActiveWorkspaceId } from '../workspace';
import { problemMessage } from '../problemMessage';
import '../requestsList.css';

const PAGE_SIZE = 25;
// The board drops pagination and scrolls the whole page, so it loads the full set in one request —
// up to the API's maximum page size (100) — grouped across all stages. Beyond that it would need
// per-column paging.
const BOARD_PAGE_SIZE = 100;
const EM_DASH = '—';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Grid columns in render order. Cells are built in this exact order per row. */
const COLUMNS: TableColumn[] = [
  { key: 'id', label: 'ID', width: 100, sortable: true },
  { key: 'name', label: 'Name', width: 250, sortable: true, filterable: true },
  { key: 'desc', label: 'Description', width: 250 },
  { key: 'stage', label: 'Stage', width: 120, sortable: true, filterable: true },
  { key: 'origin', label: 'Dept/PG/Client', width: 150, sortable: true, filterable: true },
  { key: 'analyst', label: 'Assigned analyst', width: 160, sortable: true, filterable: true },
  { key: 'tags', label: 'Tags', width: 190 },
  {
    key: 'priority',
    label: 'Priority',
    width: 90,
    align: 'right',
    sortable: true,
    filterable: true,
  },
  { key: 'repo', label: 'Repo URL', width: 210 },
  { key: 'due', label: 'Due date', sortable: true, filterable: true },
];

/** Columns offered by the saved-view editor (S24) — key + human label. */
const EDITOR_COLUMNS: ColumnOption[] = COLUMNS.map((column) => ({
  key: column.key,
  label: column.label,
}));
const DEFAULT_COLUMN_KEYS = COLUMNS.map((column) => column.key);

/** Filterable column → funnel type. */
const FILTER_TYPES: Record<string, FilterType> = {
  name: 'text',
  stage: 'select',
  origin: 'select',
  analyst: 'select',
  priority: 'number',
  due: 'date',
};

// ── Pure helpers (exported where unit-tested) ──────────────────────────────

export interface NumberFilter {
  op: '>' | '>=' | '=' | '<=' | '<';
  value: number;
}

/** Parse a comparator expression (`>5`, `<=6`, `=7`, bare `7` → `=`). Null when unparseable. */
export function parseNumberExpression(expression: string): NumberFilter | null {
  const match = expression.trim().match(/^(>=|<=|=|>|<)?\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const op = (match[1] ?? '=') as NumberFilter['op'];
  const value = Number(match[2]);
  return Number.isNaN(value) ? null : { op, value };
}

/** FilterFunnel value → query FilterClause (undefined = clear this column). */
export function filterValueToClause(value: FilterValue): FilterClause | undefined {
  switch (value.kind) {
    case 'select':
      return value.values && value.values.length > 0
        ? { kind: 'select', values: value.values }
        : undefined;
    case 'text':
      return value.contains && value.contains.trim()
        ? { kind: 'text', contains: value.contains.trim() }
        : undefined;
    case 'number': {
      const parsed = value.expression ? parseNumberExpression(value.expression) : null;
      return parsed ? { kind: 'number', op: parsed.op, value: parsed.value } : undefined;
    }
    case 'date': {
      if (!value.from && !value.to) return undefined;
      const clause: Extract<FilterClause, { kind: 'date' }> = { kind: 'date' };
      if (value.from) clause.from = value.from;
      if (value.to) clause.to = value.to;
      return clause;
    }
    default:
      return undefined;
  }
}

/** Query FilterClause → FilterFunnel value (controlled funnel). */
function clauseToFilterValue(clause: FilterClause | undefined): FilterValue | undefined {
  if (!clause) return undefined;
  switch (clause.kind) {
    case 'select':
      return { kind: 'select', values: clause.values };
    case 'text':
      return { kind: 'text', contains: clause.contains };
    case 'number':
      return { kind: 'number', expression: `${clause.op}${clause.value}` };
    case 'date': {
      const value: FilterValue = { kind: 'date' };
      if (clause.from) value.from = clause.from;
      if (clause.to) value.to = clause.to;
      return value;
    }
    default:
      return undefined;
  }
}

function summarizeClause(label: string, clause: FilterClause): string {
  switch (clause.kind) {
    case 'text':
      return `${label}: "${clause.contains}"`;
    case 'select':
      return `${label}: ${clause.values.join(', ')}`;
    case 'number':
      return `${label} ${clause.op} ${clause.value}`;
    case 'date':
      return `${label}: ${clause.from ?? '…'} – ${clause.to ?? '…'}`;
    default:
      return label;
  }
}

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === '') return EM_DASH;
  return String(value);
}

function agingSuffix(sla: SlaStatus | undefined): string {
  if (sla === 'Overdue') return ' · overdue';
  if (sla === 'DueSoon') return ' · due soon';
  return '';
}

/** ISO date → `16 Jul`, with an aging suffix so colour is never the sole signal. */
function formatDue(raw: unknown, sla: SlaStatus | undefined): string {
  if (typeof raw !== 'string' || !raw) return EM_DASH;
  const [yearPart, monthPart, dayPart] = raw.slice(0, 10).split('-');
  const month = Number(monthPart);
  const day = Number(dayPart);
  if (!yearPart || !month || !day || month < 1 || month > 12) return EM_DASH;
  return `${day} ${MONTHS[month - 1] ?? ''}${agingSuffix(sla)}`;
}

/** Distinct select options from the loaded rows (per-view live counts arrive in slice 14). */
function distinctOptions(rows: RequestListRow[], key: string) {
  const seen = new Set<string>();
  for (const row of rows) seen.add(cellText(row.columns[key]));
  return [...seen].map((value) => ({ value, label: value }));
}

function weekOutIso(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

function presetFilters(viewId: string, displayName: string): Record<string, FilterClause> {
  switch (viewId) {
    case 'unassigned':
      return { analyst: { kind: 'select', values: [EM_DASH] } };
    case 'due-week':
      return { due: { kind: 'date', to: weekOutIso() } };
    case 'mine':
      return { analyst: { kind: 'select', values: [displayName] } };
    default:
      return {};
  }
}

const SAVED_VIEWS: SavedView[] = [
  { id: 'all', name: 'All open requests', scope: 'shared', isDefault: true, tag: 'Default' },
  { id: 'unassigned', name: 'Unassigned', scope: 'shared' },
  { id: 'due-week', name: 'Due this week', scope: 'shared' },
  { id: 'mine', name: 'My requests', scope: 'personal' },
];

function toTableRow(row: RequestListRow, onOpen: () => void): TableRow {
  const columns = row.columns;
  return {
    id: row.id,
    tint: agingTintClass(row.slaStatus),
    onOpen,
    cells: [
      <span key="id" className="rl-mono">
        {cellText(columns.id)}
      </span>,
      <span key="name" className="rl-name line-clamp-3">
        {cellText(columns.name)}
      </span>,
      <span key="desc" className="rl-desc line-clamp-3" title={cellText(columns.desc)}>
        {cellText(columns.desc)}
      </span>,
      cellText(columns.stage),
      cellText(columns.origin),
      cellText(columns.analyst),
      EM_DASH,
      <span key="priority" className="rl-mono">
        {cellText(columns.priority)}
      </span>,
      <RepoCell key="repo" value={columns.repo} />,
      formatDue(columns.due, row.slaStatus),
    ],
  };
}

/** Layouts offered on the Requests surface (Slice 24 — S24). Table + Board only; the date/gallery
 *  layouts are scoped to Dashboards, not Requests. */
const REQUEST_VIEW_KINDS: RecordViewKind[] = ['table', 'kanban'];

function slaBadges(sla: SlaStatus | undefined): RecordViewItem['badges'] {
  if (sla === 'Overdue') return [{ label: 'Overdue', tone: 'error' }];
  if (sla === 'DueSoon') return [{ label: 'Due soon', tone: 'warning' }];
  return undefined;
}

/** Row → normalised board item (Slice 24). Grouped by Stage; the group value is the stage's display
 *  label (resolved from its key via the lifecycle) so the board column titles read properly. */
function toViewItem(
  row: RequestListRow,
  stageLabel: (stageKey: string) => string,
  onOpen: () => void,
): RecordViewItem {
  const columns = row.columns;
  return {
    id: row.id,
    title: cellText(columns.name),
    subtitle: columns.desc ? cellText(columns.desc) : undefined,
    groupValue: stageLabel(cellText(columns.stage)),
    badges: slaBadges(row.slaStatus),
    meta: [
      { label: 'ID', value: cellText(columns.id) },
      { label: 'Dept/PG/Client', value: cellText(columns.origin) },
      { label: 'Analyst', value: cellText(columns.analyst) },
    ],
    onOpen,
  };
}

/** Repo URL rollup cell (slice 7) — the first task-level URL field, rendered as a monospace link. */
function RepoCell({ value }: { value: unknown }) {
  if (typeof value !== 'string' || value.trim() === '') {
    return <span className="rl-muted">{EM_DASH}</span>;
  }
  const href = /^https?:\/\//.test(value) ? value : `https://${value}`;
  return (
    <a
      className="rl-repo"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
    >
      <LinkSimple size={13} weight="regular" aria-hidden />
      <span className="rl-repo__text">{value}</span>
    </a>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export function RequestsListPage() {
  const navigate = useNavigate();
  const { data: me, isLoading: isMeLoading, isError: isMeError } = useMe();
  const workspaceId = useMemo(() => resolveActiveWorkspaceId(me?.memberships), [me]);
  const displayName = me?.user.displayName ?? '';
  const isAdmin = useMemo(
    () =>
      (me?.memberships ?? []).some(
        (m) => m.workspaceId === workspaceId && m.level === 'WorkspaceAdmin',
      ),
    [me, workspaceId],
  );

  const { data: savedViews } = useSavedViews(workspaceId ?? undefined, 'Request');
  const { data: lifecycleConfig } = useLifecycleConfig(workspaceId ?? undefined);
  const exportView = useExportView();

  // Board columns come from the default lifecycle's ordered stages, so every stage shows as a column
  // (even empty ones) and titles read as labels. Rows carry the stage key; we group by key → label.
  const { boardStageOrder, stageLabelForKey } = useMemo(() => {
    const lifecycles = lifecycleConfig?.lifecycles ?? [];
    const defaultLifecycle = lifecycles.find((lifecycle) => lifecycle.isDefault) ?? lifecycles[0];
    const stages = [...(defaultLifecycle?.stages ?? [])].sort(
      (first, second) => first.sortOrder - second.sortOrder,
    );
    const labelByKey = new Map(stages.map((stage) => [stage.key, stage.label]));
    return {
      boardStageOrder: stages.map((stage) => stage.label),
      stageLabelForKey: (stageKey: string) => labelByKey.get(stageKey) ?? stageKey,
    };
  }, [lifecycleConfig]);

  const [activeViewId, setActiveViewId] = useState('all');
  const [filters, setFilters] = useState<Record<string, FilterClause>>({});
  const [sort, setSort] = useState<SortState | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<RecordViewKind>('table');
  const [editor, setEditor] = useState<{
    editingView: SavedViewDto | null;
    initialTab: 'filters' | 'fields' | 'sort';
  } | null>(null);

  const query = useMemo<PaginatedQuery>(() => {
    const isBoard = viewMode === 'kanban';
    const built: PaginatedQuery = {
      page: isBoard ? 1 : page,
      pageSize: isBoard ? BOARD_PAGE_SIZE : PAGE_SIZE,
    };
    if (Object.keys(filters).length > 0) built.filters = filters;
    if (sort) built.sort = [{ column: sort.column, direction: sort.direction }];
    return built;
  }, [viewMode, page, filters, sort]);

  const { data, isLoading, isError, error } = useRequestsList(workspaceId ?? undefined, query);

  const rows = data?.items ?? [];
  const total = data?.totalCount ?? 0;
  const hasFilters = Object.keys(filters).length > 0;

  const applyFilter = (key: string, value: FilterValue) => {
    const clause = filterValueToClause(value);
    setFilters((prev) => {
      const next = { ...prev };
      if (clause) next[key] = clause;
      else delete next[key];
      return next;
    });
    setPage(1);
  };

  const removeFilter = (key: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setPage(1);
  };

  const clearAllFilters = () => {
    setFilters({});
    setPage(1);
  };

  const selectView = (viewId: string) => {
    setActiveViewId(viewId);
    setPage(1);
    const real = (savedViews ?? []).find((view) => view.id === viewId);
    if (real) {
      setFilters({ ...real.filters });
      setSort(
        real.sort[0]
          ? { column: real.sort[0].column, direction: real.sort[0].direction }
          : undefined,
      );
    } else {
      setFilters(presetFilters(viewId, displayName));
    }
  };

  const pickerViews: SavedView[] = useMemo(
    () => [...SAVED_VIEWS, ...(savedViews ?? []).map(toPickerView)],
    [savedViews],
  );
  const activeSavedView = (savedViews ?? []).find((view) => view.id === activeViewId) ?? null;

  const onSortChange = (next: SortState | undefined) => {
    setSort(next);
    setPage(1);
  };

  const columnLabel = (key: string) => COLUMNS.find((column) => column.key === key)?.label ?? key;

  const activePills: ActiveFilterPill[] = Object.entries(filters).map(([key, clause]) => ({
    id: key,
    label: summarizeClause(columnLabel(key), clause),
    onRemove: () => removeFilter(key),
  }));

  const countFor = (viewId: string): ReactNode => (
    // TODO(slice-14): live per-view counts need one query per view; show the active count only.
    <span className="rl-count">{viewId === activeViewId ? total : EM_DASH}</span>
  );

  // Export runs against a real saved view (the API keys on a savedViewId). A built-in preset (All /
  // Unassigned / …) has no stored id, so the button is disabled until a real view is active.
  const canExport = Boolean(activeSavedView);
  const onExportView = () => {
    if (activeSavedView) exportView.mutate(activeSavedView.id);
  };

  const viewBar = (
    <ViewBar
      viewPicker={
        <SavedViewPicker
          views={pickerViews}
          activeViewId={activeViewId}
          onSelect={selectView}
          countFor={countFor}
          onModifyColumns={() => setEditor({ editingView: activeSavedView, initialTab: 'fields' })}
          onEditView={() => setEditor({ editingView: activeSavedView, initialTab: 'filters' })}
          onSaveAsNew={() => setEditor({ editingView: null, initialTab: 'filters' })}
        />
      }
      exportSlot={
        <Button
          variant="secondary"
          compact
          onClick={onExportView}
          disabled={!canExport || exportView.isPending}
          title={
            canExport
              ? 'Export the current saved view as CSV'
              : 'Save this view to export it'
          }
        >
          <DownloadSimple size={16} weight="regular" aria-hidden />{' '}
          {exportView.isPending ? 'Exporting…' : 'Export view'}
        </Button>
      }
      trailingSlot={
        <ViewModeToggle
          available={REQUEST_VIEW_KINDS}
          active={viewMode}
          onChange={setViewMode}
          label="Requests layout"
          iconOnly
        />
      }
      filters={activePills}
      onClearAll={clearAllFilters}
      primaryAction={
        <Button variant="primary" onClick={() => navigate('/requests/new')}>
          <FilePlus size={16} weight="regular" aria-hidden /> Create request
        </Button>
      }
    />
  );

  if (isMeLoading || isLoading) {
    return (
      <main className="requests-list-page list-surface" data-layout="wide">
        <h1 className="h2 requests-list-page__title">Requests</h1>
        <p className="caption" role="status">
          Loading requests…
        </p>
      </main>
    );
  }

  if (isMeError || isError || !workspaceId) {
    return (
      <main className="requests-list-page list-surface" data-layout="wide">
        <h1 className="h2 requests-list-page__title">Requests</h1>
        <p className="mws-alert mws-alert--error" role="alert">
          {problemMessage(error, 'Requests could not be loaded. Try again in a moment.')}
        </p>
      </main>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  const renderFilter = (column: TableColumn): ReactNode => {
    const type = FILTER_TYPES[column.key];
    if (!type) return null;
    return (
      <FilterFunnel
        type={type}
        columnLabel={column.label}
        value={clauseToFilterValue(filters[column.key])}
        onChange={(value) => applyFilter(column.key, value)}
        options={type === 'select' ? distinctOptions(rows, column.key) : undefined}
      />
    );
  };

  return (
    <main
      className={`requests-list-page list-surface${viewMode !== 'table' ? ' list-surface--flow' : ''}`}
      data-layout="wide"
    >
      <h1 className="h2 requests-list-page__title">Requests</h1>
      {viewBar}
      {viewMode !== 'table' && (
        // The board has no column headers to host the funnels, so filtering moves into the shared
        // GalleryFilterBar: a name search (bound to the `name` text filter) + the remaining facets
        // as labeled funnels. Same filter state/query as the table — switching keeps filters.
        <GalleryFilterBar
          ariaLabel="Filter requests"
          search={{
            value: clauseToFilterValue(filters['name'])?.contains ?? '',
            onChange: (value) => applyFilter('name', { kind: 'text', contains: value }),
            placeholder: 'Search the requests',
            label: 'Search the requests',
          }}
          facets={COLUMNS.filter((column) => FILTER_TYPES[column.key] && column.key !== 'name').map(
            (column) => ({ key: column.key, label: column.label, control: renderFilter(column) }),
          )}
        />
      )}
      {rows.length === 0 ? (
        <div className="requests-list-page__grid list-surface__body">
          {hasFilters ? (
            <EmptyListFilteredToZero onClearFilters={clearAllFilters} />
          ) : (
            <EmptyListZeroData
              icon={FilePlus}
              title="No requests yet"
              message="Create your first request to start tracking work across the workspace."
              action={
                <Button variant="primary" onClick={() => navigate('/requests/new')}>
                  Create your first request
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <div className="requests-list-page__grid list-surface__body">
          {viewMode === 'table' ? (
            <TableShell
              caption="Requests"
              columns={COLUMNS}
              rows={rows.map((row) => toTableRow(row, () => navigate(`/requests/${row.id}`)))}
              sort={sort}
              onSortChange={onSortChange}
              renderFilter={renderFilter}
            />
          ) : (
            // Board loads the full set (up to BOARD_PAGE_SIZE) and shows every lifecycle stage as a
            // column — empty stages included — in the lifecycle's order. No pager: the page scrolls.
            <KanbanView
              items={rows.map((row) =>
                toViewItem(row, stageLabelForKey, () => navigate(`/requests/${row.id}`)),
              )}
              groupOrder={boardStageOrder}
              caption="Requests by stage"
            />
          )}
          {viewMode === 'table' && (
            <TableFooter
              page={page}
              totalPages={totalPages}
              total={total}
              start={start}
              end={end}
              noun="records"
              onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
              onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            />
          )}
        </div>
      )}

      {editor && workspaceId && (
        <SavedViewEditor
          workspaceId={workspaceId}
          objectType="Request"
          availableColumns={EDITOR_COLUMNS}
          defaultColumns={DEFAULT_COLUMN_KEYS}
          editingView={editor.editingView}
          initialTab={editor.initialTab}
          canShare={isAdmin}
          onClose={() => setEditor(null)}
          onSaved={(view) => selectView(view.id)}
        />
      )}
    </main>
  );
}

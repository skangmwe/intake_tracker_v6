// S2 Requests list — the access-respecting items-grid. Composes the shared Table primitives
// (TableShell, ViewBar, SavedViewPicker, FilterFunnel) over useRequestsList. Filtering/sorting/
// paging are server-side; this page owns the view/filter/sort/page state and translates between
// the FilterFunnel value shape and the query FilterClause shape. Prototype is authoritative.

import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CaretLeft, CaretRight, DownloadSimple, FilePlus } from '@phosphor-icons/react';

import type { FilterClause, PaginatedQuery, RequestListRow, SlaStatus } from '@shared/types';

import { Button, IconButton } from '@/shared/components/Button';
import {
  FilterFunnel,
  SavedViewPicker,
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
import { agingTintClass } from '@/shared/components/Feedback';
import { useMe } from '@/features/users/useMe';

import { useRequestsList } from '../useRequests';
import { resolveActiveWorkspaceId } from '../workspace';
import { problemMessage } from '../problemMessage';
import '../requestsList.css';

const PAGE_SIZE = 25;
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
  { key: 'priority', label: 'Priority', width: 90, align: 'right', sortable: true, filterable: true },
  { key: 'repo', label: 'Repo URL', width: 210 },
  { key: 'due', label: 'Due date', sortable: true, filterable: true },
];

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
      return value.values && value.values.length > 0 ? { kind: 'select', values: value.values } : undefined;
    case 'text':
      return value.contains && value.contains.trim() ? { kind: 'text', contains: value.contains.trim() } : undefined;
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
      <span className="rl-mono">{cellText(columns.id)}</span>,
      <span className="rl-name line-clamp-3">{cellText(columns.name)}</span>,
      <span className="rl-desc line-clamp-3" title={cellText(columns.desc)}>
        {cellText(columns.desc)}
      </span>,
      cellText(columns.stage),
      cellText(columns.origin),
      cellText(columns.analyst),
      EM_DASH,
      <span className="rl-mono">{cellText(columns.priority)}</span>,
      EM_DASH,
      formatDue(columns.due, row.slaStatus),
    ],
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface RequestsPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  start: number;
  end: number;
  onPrev: () => void;
  onNext: () => void;
}

function RequestsPagination({ page, totalPages, total, start, end, onPrev, onNext }: RequestsPaginationProps) {
  return (
    <div className="rl-pagination">
      <span className="rl-pagination__summary">
        {total === 0 ? '0 records' : `${start}–${end} of ${total} records`}
      </span>
      <div className="rl-pagination__nav">
        <IconButton icon={CaretLeft} label="Previous page" bordered onClick={onPrev} />
        <span className="rl-pagination__page">
          Page {page} of {totalPages}
        </span>
        <IconButton icon={CaretRight} label="Next page" bordered onClick={onNext} />
      </div>
    </div>
  );
}

interface RequestsEmptyProps {
  filtered: boolean;
  onClearFilters: () => void;
  onCreate: () => void;
}

function RequestsEmpty({ filtered, onClearFilters, onCreate }: RequestsEmptyProps) {
  if (filtered) {
    return (
      <div className="rl-empty" data-ds="empty-filtered">
        <p className="rl-empty__title">No requests match the current filters.</p>
        <div className="rl-empty__actions">
          <Button variant="secondary" onClick={onClearFilters}>
            Clear all filters
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="rl-empty" data-ds="empty-zero">
      <p className="rl-empty__title">No requests yet.</p>
      <div className="rl-empty__actions">
        <Button variant="primary" onClick={onCreate}>
          Create request
        </Button>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export function RequestsListPage() {
  const navigate = useNavigate();
  const { data: me, isLoading: isMeLoading, isError: isMeError } = useMe();
  const workspaceId = useMemo(() => resolveActiveWorkspaceId(me?.memberships), [me]);
  const displayName = me?.user.displayName ?? '';

  const [activeViewId, setActiveViewId] = useState('all');
  const [filters, setFilters] = useState<Record<string, FilterClause>>({});
  const [sort, setSort] = useState<SortState | undefined>(undefined);
  const [page, setPage] = useState(1);

  const query = useMemo<PaginatedQuery>(() => {
    const built: PaginatedQuery = { page, pageSize: PAGE_SIZE };
    if (Object.keys(filters).length > 0) built.filters = filters;
    if (sort) built.sort = [{ column: sort.column, direction: sort.direction }];
    return built;
  }, [page, filters, sort]);

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
    setFilters(presetFilters(viewId, displayName));
    setPage(1);
  };

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

  const noop = () => undefined;

  const viewBar = (
    <ViewBar
      viewPicker={
        <SavedViewPicker
          views={SAVED_VIEWS}
          activeViewId={activeViewId}
          onSelect={selectView}
          countFor={countFor}
          onModifyColumns={noop}
          onEditView={noop}
          onSaveAsNew={noop}
        />
      }
      exportSlot={
        <Button variant="secondary" compact onClick={noop} title="Export the current view (coming soon)">
          <DownloadSimple size={16} weight="regular" aria-hidden /> Export view
        </Button>
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
      <main className="requests-list-page">
        <h1 className="h1 requests-list-page__title">Requests</h1>
        <p className="caption" role="status">
          Loading requests…
        </p>
      </main>
    );
  }

  if (isMeError || isError || !workspaceId) {
    return (
      <main className="requests-list-page">
        <h1 className="h1 requests-list-page__title">Requests</h1>
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
    <main className="requests-list-page">
      <h1 className="h1 requests-list-page__title">Requests</h1>
      {viewBar}
      {rows.length === 0 ? (
        <div className="requests-list-page__grid">
          <RequestsEmpty
            filtered={hasFilters}
            onClearFilters={clearAllFilters}
            onCreate={() => navigate('/requests/new')}
          />
        </div>
      ) : (
        <div className="requests-list-page__grid">
          <TableShell
            caption="Requests"
            columns={COLUMNS}
            rows={rows.map((row) => toTableRow(row, () => navigate(`/requests/${row.id}`)))}
            sort={sort}
            onSortChange={onSortChange}
            renderFilter={renderFilter}
          />
          <RequestsPagination
            page={page}
            totalPages={totalPages}
            total={total}
            start={start}
            end={end}
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          />
        </div>
      )}
    </main>
  );
}

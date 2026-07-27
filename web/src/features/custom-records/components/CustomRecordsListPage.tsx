// SP2 custom-object records list — the access-respecting records grid for one custom object. Clones
// the Requests list wiring (TableShell + ViewBar + FilterFunnel + saved views) but drives its columns
// off the object's field schema instead of a fixed column set. The route param `:objectKey` resolves
// to a real ObjectDefinition via the workspace's objects; an unknown slug renders NoAccessPage so the
// surface never discloses existence. Filtering/sorting/paging are server-side; this page owns the
// view/filter/sort/page state and translates between the FilterFunnel value shape and FilterClause.
// Length: a route component composing schema resolution + list wiring (web-component-architecture.md
// allows page components up to 250 lines).

import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Table } from '@phosphor-icons/react';

import type {
  FieldDefinitionDto,
  FieldObjectType,
  FilterClause,
  PaginatedQuery,
  SavedViewDto,
} from '@shared/types';

import { Button } from '@/shared/components/Button';
import {
  FilterFunnel,
  SavedViewPicker,
  TableFooter,
  TableShell,
  ViewBar,
  type ActiveFilterPill,
  type FilterOption,
  type FilterType,
  type FilterValue,
  type SavedView,
  type SortState,
  type TableColumn,
  type TableRow,
} from '@/shared/components/Table';
import { EmptyListFilteredToZero, EmptyListZeroData, NoAccessPage } from '@/shared/components/EdgeStates';
import { useMe } from '@/features/users/useMe';
import { useActiveWorkspaceId } from '@/shared/workspace/ActiveWorkspaceContext';
import { SavedViewEditor, toPickerView, useSavedViews, type ColumnOption } from '@/features/saved-views';
import { useWorkspaceFields } from '@/features/fields';
import { useWorkspaceObjects } from '@/features/objects';

import { RECORDS_PAGE_SIZE } from '@/shared/constants';

import { useCustomRecordsList } from '../useCustomRecords';
import {
  buildColumns,
  clauseToFilterValue,
  filterTypeFor,
  filterValueToClause,
} from '../recordColumns';
import { RecordRowActions } from './RecordRowActions';
import '../customRecords.css';

const EM_DASH = '—';

/** The trailing row-actions column, appended after the schema-derived columns. */
const ACTIONS_COLUMN: TableColumn = { key: 'actions', label: 'Actions', width: 76, align: 'center' };

/** The built-in default view — no stored id, just clears back to the full record set. */
const DEFAULT_VIEWS: SavedView[] = [
  { id: 'all', name: 'All records', scope: 'shared', isDefault: true, tag: 'Default' },
];

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === '') return EM_DASH;
  if (Array.isArray(value)) return value.length > 0 ? value.map(String).join(', ') : EM_DASH;
  return String(value);
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

/** Options for a select field's funnel — the field's own option set (value/label). */
function selectOptions(field: FieldDefinitionDto): FilterOption[] {
  return field.options.map((option) => ({ value: option.value, label: option.label }));
}

export function CustomRecordsListPage() {
  const navigate = useNavigate();
  const { objectKey = '' } = useParams<{ objectKey: string }>();
  const { data: me, isLoading: isMeLoading } = useMe();
  const workspaceId = useActiveWorkspaceId();
  const isAdmin = useMemo(
    () =>
      (me?.memberships ?? []).some(
        (membership) => membership.workspaceId === workspaceId && membership.level === 'WorkspaceAdmin',
      ),
    [me, workspaceId],
  );

  const objects = useWorkspaceObjects(workspaceId ?? undefined);
  const object = objects.data?.find((candidate) => candidate.objectKey === objectKey);

  // Slice A widened GET /fields to resolve custom-object slugs; the TS FieldObjectType union stays
  // closed to preserve built-in autocomplete, so the slug is cast at this single call site. The
  // schema query is disabled until the object resolves (undefined workspace = disabled).
  const schema = useWorkspaceFields(
    object ? (workspaceId ?? undefined) : undefined,
    (object?.objectKey ?? 'Request') as FieldObjectType,
  );
  const { data: savedViews } = useSavedViews(workspaceId ?? undefined, objectKey);

  const [activeViewId, setActiveViewId] = useState('all');
  const [filters, setFilters] = useState<Record<string, FilterClause>>({});
  const [sort, setSort] = useState<SortState | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{
    editingView: SavedViewDto | null;
    initialTab: 'filters' | 'fields' | 'sort';
  } | null>(null);

  const query = useMemo<PaginatedQuery>(() => {
    const built: PaginatedQuery = { page, pageSize: RECORDS_PAGE_SIZE };
    if (Object.keys(filters).length > 0) built.filters = filters;
    if (sort) built.sort = [{ column: sort.column, direction: sort.direction }];
    return built;
  }, [page, filters, sort]);

  const records = useCustomRecordsList(workspaceId ?? undefined, object?.id, query);

  const schemaFields = useMemo(() => schema.data?.fields ?? [], [schema.data]);
  const baseColumns = useMemo(() => buildColumns(schemaFields), [schemaFields]);
  const fieldByKey = useMemo(
    () => new Map(schemaFields.map((field) => [field.fieldKey, field])),
    [schemaFields],
  );
  const filterTypes = useMemo(() => {
    const map: Record<string, FilterType> = { name: 'text' };
    for (const field of schemaFields) {
      const type = filterTypeFor(field);
      if (type) map[field.fieldKey] = type;
    }
    return map;
  }, [schemaFields]);

  const editorColumns: ColumnOption[] = baseColumns.map((column) => ({
    key: column.key,
    label: column.label,
  }));
  const defaultColumnKeys = baseColumns.map((column) => column.key);

  const rows = records.data?.items ?? [];
  const total = records.data?.totalCount ?? 0;
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
        real.sort[0] ? { column: real.sort[0].column, direction: real.sort[0].direction } : undefined,
      );
    } else {
      setFilters({});
      setSort(undefined);
    }
  };

  const onSortChange = (next: SortState | undefined) => {
    setSort(next);
    setPage(1);
  };

  const pickerViews: SavedView[] = useMemo(
    () => [...DEFAULT_VIEWS, ...(savedViews ?? []).map(toPickerView)],
    [savedViews],
  );
  const activeSavedView = (savedViews ?? []).find((view) => view.id === activeViewId) ?? null;

  const columnLabel = (key: string) => baseColumns.find((column) => column.key === key)?.label ?? key;
  const activePills: ActiveFilterPill[] = Object.entries(filters).map(([key, clause]) => ({
    id: key,
    label: summarizeClause(columnLabel(key), clause),
    onRemove: () => removeFilter(key),
  }));
  const countFor = (viewId: string): ReactNode => (
    <span className="cr-count">{viewId === activeViewId ? total : EM_DASH}</span>
  );

  if (isMeLoading || objects.isLoading) {
    return (
      <main className="custom-records-page list-surface" data-layout="wide" data-ds="page">
        <p className="caption" role="status">
          Loading records…
        </p>
      </main>
    );
  }

  if (!workspaceId || !object) {
    return <NoAccessPage resourceNoun="record" onGoHome={() => navigate('/')} />;
  }

  const columns: TableColumn[] = [...baseColumns, ACTIONS_COLUMN];
  const title = object.pluralLabel ?? object.name;

  const renderFilter = (column: TableColumn): ReactNode => {
    const type = filterTypes[column.key];
    if (!type) return null;
    const field = fieldByKey.get(column.key);
    return (
      <FilterFunnel
        type={type}
        columnLabel={column.label}
        value={clauseToFilterValue(filters[column.key])}
        onChange={(value) => applyFilter(column.key, value)}
        options={type === 'select' && field ? selectOptions(field) : undefined}
      />
    );
  };

  const toRow = (record: (typeof rows)[number]): TableRow => ({
    id: record.id,
    onOpen: () => navigate(`/objects/${objectKey}/${record.id}`),
    cells: [
      <span key="name" className="cr-name">
        {cellText(record.name)}
      </span>,
      ...baseColumns.slice(1).map((column) => <span key={column.key}>{cellText(record.fields[column.key])}</span>),
      <RecordRowActions
        key="actions"
        recordLabel={record.name || 'record'}
        onView={() => navigate(`/objects/${objectKey}/${record.id}`)}
        onEdit={() => navigate(`/objects/${objectKey}/${record.id}`)}
        onDelete={() => navigate(`/objects/${objectKey}/${record.id}`)}
      />,
    ],
  });

  const totalPages = Math.max(1, Math.ceil(total / RECORDS_PAGE_SIZE));
  const start = total === 0 ? 0 : (page - 1) * RECORDS_PAGE_SIZE + 1;
  const end = Math.min(page * RECORDS_PAGE_SIZE, total);

  return (
    <main className="custom-records-page list-surface" data-layout="wide" data-ds="page">
      <h1 className="h2 custom-records-page__title">{title}</h1>
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
        filters={activePills}
        onClearAll={clearAllFilters}
        primaryAction={
          <Button variant="primary" onClick={() => navigate(`/objects/${objectKey}/new`)}>
            <Plus size={16} weight="regular" aria-hidden /> New record
          </Button>
        }
      />

      {records.isError ? (
        <p className="mws-alert mws-alert--error" role="alert">
          These records could not be loaded. Try again in a moment.
        </p>
      ) : schema.isLoading || records.isLoading ? (
        <p className="caption" role="status">
          Loading records…
        </p>
      ) : rows.length === 0 ? (
        <div className="custom-records-page__grid list-surface__body">
          {hasFilters ? (
            <EmptyListFilteredToZero onClearFilters={clearAllFilters} />
          ) : (
            <EmptyListZeroData
              icon={Table}
              title={`No ${title.toLowerCase()} yet`}
              message="Create the first record to start tracking this object."
              action={
                <Button variant="primary" onClick={() => navigate(`/objects/${objectKey}/new`)}>
                  Create your first record
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <div className="custom-records-page__grid list-surface__body">
          <TableShell
            caption={`${title} records`}
            columns={columns}
            rows={rows.map(toRow)}
            sort={sort}
            onSortChange={onSortChange}
            renderFilter={renderFilter}
          />
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
        </div>
      )}

      {editor && (
        <SavedViewEditor
          workspaceId={workspaceId}
          objectType={objectKey}
          availableColumns={editorColumns}
          defaultColumns={defaultColumnKeys}
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

// S9 Feature catalog — the access-respecting items-grid over the Feature Catalog (AI Solutions
// hub). Reuses the shared Table primitives (TableShell, ViewBar, SavedViewPicker, FilterFunnel) over
// useFeaturesList, and wires the saved-view picker to the real S24 editor. The "Gallery view" toggle
// is present but disabled — the gallery (S11) arrives in a later iteration. Prototype-styled.

import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cards, Plus } from '@phosphor-icons/react';

import type { FeatureListRow, FilterClause, PaginatedQuery, SavedViewDto } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { EmptyListFilteredToZero, EmptyListZeroData } from '@/shared/components/EdgeStates';
import {
  GalleryView,
  ViewModeToggle,
  type RecordViewItem,
  type RecordViewKind,
} from '@/shared/components/RecordViews';
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
import { useMe } from '@/features/users/useMe';
import { resolveActiveWorkspaceId } from '@/features/requests/workspace';
import {
  SavedViewEditor,
  toPickerView,
  useSavedViews,
  type ColumnOption,
} from '@/features/saved-views';

import { useFeaturesList } from '../useFeatures';
import '../features.css';

const PAGE_SIZE = 25;
const EM_DASH = '—';

const COLUMNS: TableColumn[] = [
  { key: 'id', label: 'ID', width: 100, sortable: true },
  { key: 'name', label: 'Name', width: 220, sortable: true, filterable: true },
  { key: 'oneLiner', label: 'One-liner', width: 260 },
  { key: 'featureType', label: 'Type', width: 130, sortable: true, filterable: true },
  { key: 'techStack', label: 'Tech / stack', width: 180, filterable: true },
  { key: 'capabilityTags', label: 'Tags', width: 180 },
  { key: 'owner', label: 'Owner', width: 140 },
  { key: 'maturity', label: 'Maturity', width: 120, sortable: true, filterable: true },
];

const FILTER_TYPES: Record<string, FilterType> = {
  name: 'text',
  featureType: 'select',
  techStack: 'select',
  maturity: 'select',
};

const EDITOR_COLUMNS: ColumnOption[] = COLUMNS.map((column) => ({
  key: column.key,
  label: column.label,
}));
const DEFAULT_COLUMN_KEYS = COLUMNS.map((column) => column.key);

/** The seeded "Published catalog" default view (BS §18.7) — client preset, always present. */
const PUBLISHED_VIEW_ID = 'published';
const PUBLISHED_FILTERS: Record<string, FilterClause> = {
  maturity: { kind: 'select', values: ['Published'] },
};

function filterValueToClause(value: FilterValue): FilterClause | undefined {
  if (value.kind === 'select') {
    return value.values && value.values.length > 0
      ? { kind: 'select', values: value.values }
      : undefined;
  }
  if (value.kind === 'text') {
    return value.contains && value.contains.trim()
      ? { kind: 'text', contains: value.contains.trim() }
      : undefined;
  }
  return undefined;
}

function clauseToFilterValue(clause: FilterClause | undefined): FilterValue | undefined {
  if (!clause) return undefined;
  if (clause.kind === 'select') return { kind: 'select', values: clause.values };
  if (clause.kind === 'text') return { kind: 'text', contains: clause.contains };
  return undefined;
}

function summarizeClause(label: string, clause: FilterClause): string {
  if (clause.kind === 'text') return `${label}: "${clause.contains}"`;
  if (clause.kind === 'select') return `${label}: ${clause.values.join(', ')}`;
  return label;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === '') return EM_DASH;
  return String(value);
}

function tagList(values: string[]): string {
  return values.length > 0 ? values.join(', ') : EM_DASH;
}

function distinctOptions(rows: FeatureListRow[], key: 'featureType' | 'maturity' | 'techStack') {
  const seen = new Set<string>();
  for (const row of rows) {
    if (key === 'techStack') row.techStack.forEach((value) => seen.add(value));
    else seen.add(cellText(row[key]));
  }
  return [...seen].filter((value) => value !== EM_DASH).map((value) => ({ value, label: value }));
}

function toTableRow(row: FeatureListRow, onOpen: () => void): TableRow {
  return {
    id: row.id,
    onOpen,
    cells: [
      <span key="id" className="fc-mono">
        {cellText(row.id)}
      </span>,
      <span key="name" className="fc-name">
        {cellText(row.name)}
      </span>,
      <span key="oneLiner" className="fc-oneliner line-clamp-2">
        {cellText(row.oneLiner)}
      </span>,
      cellText(row.featureType),
      tagList(row.techStack),
      tagList(row.capabilityTags),
      cellText(row.owner),
      <MaturityBadge key="maturity" maturity={row.maturity} />,
    ],
  };
}

function MaturityBadge({ maturity }: { maturity: string }) {
  const tone =
    maturity === 'Published'
      ? 'fc-badge--published'
      : maturity === 'Deprecated'
        ? 'fc-badge--deprecated'
        : 'fc-badge--draft';
  return (
    <span className={`fc-badge ${tone}`} data-ds="badge">
      {maturity}
    </span>
  );
}

/** Layouts offered on the Feature catalog (Slice 24 — S9 table + S11 gallery). */
const FEATURE_VIEW_KINDS: RecordViewKind[] = ['table', 'gallery'];

function maturityBadges(maturity: string): RecordViewItem['badges'] {
  if (maturity === 'Published') return [{ label: 'Published', tone: 'success' }];
  if (maturity === 'Deprecated') return [{ label: 'Deprecated', tone: 'error' }];
  return [{ label: maturity || 'Draft', tone: 'neutral' }];
}

/** Row → gallery item (Slice 24 — S11). Thumbnail is the first image attachment; placeholder when absent. */
function toGalleryItem(row: FeatureListRow, onOpen: () => void): RecordViewItem {
  return {
    id: row.id,
    title: cellText(row.name),
    subtitle: row.oneLiner ? cellText(row.oneLiner) : undefined,
    badges: maturityBadges(row.maturity),
    tags: row.capabilityTags.slice(0, 4),
    thumbnailUrl: row.thumbnailUrl,
    onOpen,
  };
}

type EditorState = {
  editingView: SavedViewDto | null;
  initialTab: 'filters' | 'fields' | 'sort';
} | null;

export function FeatureCatalogPage() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const workspaceId = useMemo(() => resolveActiveWorkspaceId(me?.memberships), [me]);
  const isAdmin = useMemo(
    () =>
      (me?.memberships ?? []).some(
        (m) => m.workspaceKind === 'ai-solutions' && m.level === 'WorkspaceAdmin',
      ),
    [me],
  );

  const { data: savedViews } = useSavedViews(workspaceId ?? undefined, 'Feature');

  const [activeViewId, setActiveViewId] = useState(PUBLISHED_VIEW_ID);
  const [filters, setFilters] = useState<Record<string, FilterClause>>(PUBLISHED_FILTERS);
  const [sort, setSort] = useState<SortState | undefined>({ column: 'updated', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<RecordViewKind>('table');
  const [editor, setEditor] = useState<EditorState>(null);

  const query = useMemo<PaginatedQuery>(() => {
    const built: PaginatedQuery = { page, pageSize: PAGE_SIZE };
    if (Object.keys(filters).length > 0) built.filters = filters;
    if (sort) built.sort = [{ column: sort.column, direction: sort.direction }];
    return built;
  }, [page, filters, sort]);

  const { data, isLoading, isError } = useFeaturesList(query);
  const rows = data?.items ?? [];
  const total = data?.totalCount ?? 0;
  const hasFilters = Object.keys(filters).length > 0;

  const pickerViews: SavedView[] = useMemo(() => {
    const preset: SavedView = {
      id: PUBLISHED_VIEW_ID,
      name: 'Published catalog',
      scope: 'shared',
      isDefault: true,
      tag: 'Default',
    };
    return [preset, ...(savedViews ?? []).map(toPickerView)];
  }, [savedViews]);

  const activeSavedView = (savedViews ?? []).find((view) => view.id === activeViewId) ?? null;

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

  const selectView = (viewId: string) => {
    setActiveViewId(viewId);
    setPage(1);
    if (viewId === PUBLISHED_VIEW_ID) {
      setFilters(PUBLISHED_FILTERS);
      setSort({ column: 'updated', direction: 'desc' });
      return;
    }
    const view = (savedViews ?? []).find((entry) => entry.id === viewId);
    setFilters(view ? { ...view.filters } : {});
    setSort(
      view && view.sort[0]
        ? { column: view.sort[0].column, direction: view.sort[0].direction }
        : undefined,
    );
  };

  const columnLabel = (key: string) => COLUMNS.find((column) => column.key === key)?.label ?? key;
  const activePills: ActiveFilterPill[] = Object.entries(filters).map(([key, clause]) => ({
    id: key,
    label: summarizeClause(columnLabel(key), clause),
    onRemove: () => {
      setFilters((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setPage(1);
    },
  }));

  const openEditor = (initialTab: 'filters' | 'fields' | 'sort', editing: SavedViewDto | null) =>
    setEditor({ editingView: editing, initialTab });

  const countFor = (viewId: string): ReactNode => (
    <span className="fc-count">{viewId === activeViewId ? total : EM_DASH}</span>
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const viewBar = (
    <ViewBar
      viewPicker={
        <SavedViewPicker
          views={pickerViews}
          activeViewId={activeViewId}
          onSelect={selectView}
          countFor={countFor}
          onModifyColumns={() => openEditor('fields', activeSavedView)}
          onEditView={() => openEditor('filters', activeSavedView)}
          onSaveAsNew={() => openEditor('filters', null)}
        />
      }
      layoutSlot={
        <ViewModeToggle
          available={FEATURE_VIEW_KINDS}
          active={viewMode}
          onChange={setViewMode}
          label="Feature catalog layout"
        />
      }
      filters={activePills}
      onClearAll={() => {
        setFilters({});
        setPage(1);
      }}
      primaryAction={
        <Button variant="primary" onClick={() => navigate('/feature-catalog/new')}>
          <Plus size={16} weight="regular" aria-hidden /> New feature
        </Button>
      }
    />
  );

  if (isLoading) {
    return (
      <main className="feature-catalog-page">
        <h1 className="h1 feature-catalog-page__title">Feature Catalog</h1>
        <p className="caption" role="status">
          Loading features…
        </p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="feature-catalog-page">
        <h1 className="h1 feature-catalog-page__title">Feature Catalog</h1>
        <p className="mws-alert mws-alert--error" role="alert">
          The catalog could not be loaded. Try again in a moment.
        </p>
      </main>
    );
  }

  const renderFilter = (column: TableColumn): ReactNode => {
    const type = FILTER_TYPES[column.key];
    if (!type) return null;
    return (
      <FilterFunnel
        type={type}
        columnLabel={column.label}
        value={clauseToFilterValue(filters[column.key])}
        onChange={(value) => applyFilter(column.key, value)}
        options={
          type === 'select' &&
          (column.key === 'featureType' || column.key === 'maturity' || column.key === 'techStack')
            ? distinctOptions(rows, column.key)
            : undefined
        }
      />
    );
  };

  return (
    <main className="feature-catalog-page">
      <h1 className="h1 feature-catalog-page__title">Feature Catalog</h1>
      {viewBar}
      <div className="feature-catalog-page__grid">
        {rows.length === 0 ? (
          hasFilters ? (
            <EmptyListFilteredToZero
              onClearFilters={() => {
                setFilters({});
                setPage(1);
              }}
            />
          ) : (
            <EmptyListZeroData
              icon={Cards}
              title="No features in the catalog yet"
              message="Harvest a feature from a shipped request, or add one to start the catalog."
              action={
                <Button variant="primary" onClick={() => navigate('/feature-catalog/new')}>
                  Add your first feature
                </Button>
              }
            />
          )
        ) : (
          <>
            {viewMode === 'gallery' ? (
              <GalleryView
                items={rows.map((row) =>
                  toGalleryItem(row, () => navigate(`/feature-catalog/${row.id}`)),
                )}
                caption="Feature gallery"
              />
            ) : (
              <TableShell
                caption="Feature Catalog"
                columns={COLUMNS}
                rows={rows.map((row) =>
                  toTableRow(row, () => navigate(`/feature-catalog/${row.id}`)),
                )}
                sort={sort}
                onSortChange={(next) => {
                  setSort(next);
                  setPage(1);
                }}
                renderFilter={renderFilter}
              />
            )}
            <div className="fc-pagination">
              <span className="fc-pagination__summary">
                {total === 0 ? '0 features' : `Page ${page} of ${totalPages} · ${total} features`}
              </span>
            </div>
          </>
        )}
      </div>

      {editor && workspaceId && (
        <SavedViewEditor
          workspaceId={workspaceId}
          objectType="Feature"
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

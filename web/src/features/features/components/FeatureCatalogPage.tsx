// S9 Feature catalog — the access-respecting items-grid over the Feature Catalog (AI Solutions
// hub). A Toolkit-style surface: a persistent search toolbar + a table/gallery view toggle, with
// column-header filter funnels in the table and the shared GalleryFilterBar in the gallery. Saved
// views are intentionally NOT offered here — they live only on the Requests surface. Prototype-styled.

import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cards, MagnifyingGlass, Plus } from '@phosphor-icons/react';

import type { FeatureListRow, FilterClause, PaginatedQuery } from '@shared/types';

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
  GalleryFilterBar,
  TableFooter,
  TableShell,
  type FilterType,
  type FilterValue,
  type SortState,
  type TableColumn,
  type TableRow,
} from '@/shared/components/Table';

import { useFeaturesList } from '../useFeatures';
import '../features.css';

const PAGE_SIZE = 25;
// The gallery drops pagination and scrolls the whole page, so it loads the full set in one request —
// up to the API's maximum page size (100). Beyond that a catalog would need infinite scroll.
const GALLERY_PAGE_SIZE = 100;
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

export function FeatureCatalogPage() {
  const navigate = useNavigate();

  const [filters, setFilters] = useState<Record<string, FilterClause>>({});
  const [sort, setSort] = useState<SortState | undefined>({ column: 'updated', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<RecordViewKind>('table');

  const query = useMemo<PaginatedQuery>(() => {
    const isGallery = viewMode === 'gallery';
    const built: PaginatedQuery = {
      page: isGallery ? 1 : page,
      pageSize: isGallery ? GALLERY_PAGE_SIZE : PAGE_SIZE,
    };
    if (Object.keys(filters).length > 0) built.filters = filters;
    if (sort) built.sort = [{ column: sort.column, direction: sort.direction }];
    return built;
  }, [viewMode, page, filters, sort]);

  const { data, isLoading, isError } = useFeaturesList(query);
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  // A Toolkit-style toolbar: persistent name search on the left, layout toggle + New feature on the
  // right. Filtering by facet lives in the table column funnels / the gallery's GalleryFilterBar.
  const toolbar = (
    <div className="fc-toolbar">
      <span className="fc-search">
        <MagnifyingGlass size={16} weight="regular" aria-hidden className="fc-search__icon" />
        <input
          type="search"
          className="fc-search__input"
          placeholder="Search the feature catalog"
          aria-label="Search the feature catalog"
          value={clauseToFilterValue(filters['name'])?.contains ?? ''}
          onChange={(event) => applyFilter('name', { kind: 'text', contains: event.target.value })}
        />
      </span>
      <span className="fc-toolbar__spacer" />
      <ViewModeToggle
        available={FEATURE_VIEW_KINDS}
        active={viewMode}
        onChange={setViewMode}
        label="Feature catalog layout"
        iconOnly
      />
      <Button variant="primary" onClick={() => navigate('/feature-catalog/new')}>
        <Plus size={16} weight="regular" aria-hidden /> New feature
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <main className="feature-catalog-page list-surface" data-layout="wide">
        <h1 className="h2 feature-catalog-page__title">Feature Catalog</h1>
        <p className="caption" role="status">
          Loading features…
        </p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="feature-catalog-page list-surface" data-layout="wide">
        <h1 className="h2 feature-catalog-page__title">Feature Catalog</h1>
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
    <main
      className={`feature-catalog-page list-surface${viewMode === 'gallery' ? ' list-surface--flow' : ''}`}
      data-layout="wide"
    >
      <h1 className="h2 feature-catalog-page__title">Feature Catalog</h1>
      {toolbar}
      {viewMode === 'gallery' && (
        // Gallery has no column headers to host the funnels; the toolbar already carries the search,
        // so the facet funnels move into the shared GalleryFilterBar. Same filter state as the table.
        <GalleryFilterBar
          ariaLabel="Filter features"
          facets={COLUMNS.filter((column) => FILTER_TYPES[column.key] && column.key !== 'name').map(
            (column) => ({ key: column.key, label: column.label, control: renderFilter(column) }),
          )}
        />
      )}
      <div className="feature-catalog-page__grid list-surface__body">
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
            {viewMode !== 'gallery' && (
              <TableFooter
                page={page}
                totalPages={totalPages}
                total={total}
                start={start}
                end={end}
                noun="features"
                onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
                onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}

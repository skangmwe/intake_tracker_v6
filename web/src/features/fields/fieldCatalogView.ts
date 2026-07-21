// Pure sort / filter for the reconciled S30 Fields tab (flat catalog). The catalog endpoint returns
// the whole set (synthesised system rows + stored custom fields), so the list-surface chrome
// (sortable headers, per-column funnels, count footer) is applied client-side here — one pure
// function so it is unit-testable without rendering. The prototype has no pager, so the whole
// filtered/sorted set is returned; the footer shows the count only.

import type { FilterValue, SortState } from '@/shared/components/Table';

import type { FieldCatalogRowDto } from '@shared/types';

import { fieldLocationLabel, fieldTypeLabel, objectLabel } from './constants';

/** Every column is both sortable and filterable (matches the prototype). */
export type CatalogColumnKey =
  'field' | 'key' | 'type' | 'object' | 'location' | 'required' | 'source' | 'status';

export type CatalogFilters = Partial<Record<CatalogColumnKey, FilterValue>>;

export interface CatalogView {
  rows: FieldCatalogRowDto[];
  total: number;
}

/** A funnel value is "active" only once the user has entered something to filter on. */
export function isFilterActive(value: FilterValue | undefined): boolean {
  if (!value) return false;
  return Boolean(value.values?.length || value.contains?.trim());
}

/** The user-facing string a column contributes for select-matching, sorting, and text search. */
export function facetValue(row: FieldCatalogRowDto, column: CatalogColumnKey): string {
  switch (column) {
    case 'field':
      return row.displayName;
    case 'key':
      return row.fieldKey;
    case 'type':
      return fieldTypeLabel(row.fieldType);
    case 'object':
      return objectLabel(row.objectType);
    case 'location':
      return fieldLocationLabel(row.location);
    case 'required':
      return row.isRequired ? 'Required' : 'Optional';
    case 'source':
      return row.source;
    case 'status':
      return row.status;
    default:
      return '';
  }
}

function matchesFilter(
  row: FieldCatalogRowDto,
  column: CatalogColumnKey,
  value: FilterValue,
): boolean {
  if (value.kind === 'select') {
    const values = value.values ?? [];
    if (values.length === 0) return true;
    return values.includes(facetValue(row, column));
  }
  if (value.kind === 'text') {
    const query = (value.contains ?? '').trim().toLowerCase();
    if (query === '') return true;
    return facetValue(row, column).toLowerCase().includes(query);
  }
  return true;
}

function compareBy(sort: SortState, left: FieldCatalogRowDto, right: FieldCatalogRowDto): number {
  const direction = sort.direction === 'asc' ? 1 : -1;
  const column = sort.column as CatalogColumnKey;
  return facetValue(left, column).localeCompare(facetValue(right, column)) * direction;
}

export function selectCatalogView(
  allRows: FieldCatalogRowDto[],
  sort: SortState | undefined,
  filters: CatalogFilters,
): CatalogView {
  const activeFilters = (Object.entries(filters) as [CatalogColumnKey, FilterValue][]).filter(
    ([, value]) => isFilterActive(value),
  );

  const filtered = allRows.filter((row) =>
    activeFilters.every(([column, value]) => matchesFilter(row, column, value)),
  );

  const rows = sort ? [...filtered].sort((left, right) => compareBy(sort, left, right)) : filtered;

  return { rows, total: rows.length };
}

/** Distinct facet values (for a select funnel) with the count of rows carrying each, in first-seen order. */
export function facetOptions(
  allRows: FieldCatalogRowDto[],
  column: CatalogColumnKey,
): { value: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of allRows) {
    const key = facetValue(row, column);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([value, count]) => ({ value, label: value, count }));
}

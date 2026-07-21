// Pure sort / filter / paginate for the S30 Objects tab. The objects endpoint returns the whole set
// (built-ins + custom), so the list-surface chrome (sortable headers, per-column funnels, footer
// count) is applied client-side here — one pure function so it is unit-testable without rendering.
// Object name / Plural / Location are text; Records / Fields are numeric; Location filters as a select.

import type { FilterValue, SortState } from '@/shared/components/Table';

import type { ObjectDefinitionDto } from '@shared/types';

import { locationLabel } from './constants';

/** The sortable data columns. Description is neither sortable nor filterable (matches the prototype). */
export type ObjectColumnKey = 'name' | 'plural' | 'records' | 'fieldCount' | 'location';

export type ObjectsFilters = Partial<Record<ObjectColumnKey, FilterValue>>;

export interface ObjectsView {
  rows: ObjectDefinitionDto[];
  total: number;
  totalPages: number;
  start: number;
  end: number;
}

/** A funnel value is "active" only once the user has entered something to filter on. */
export function isFilterActive(value: FilterValue | undefined): boolean {
  if (!value) return false;
  return Boolean(value.values?.length || value.contains?.trim());
}

function textFor(object: ObjectDefinitionDto, column: 'name' | 'plural' | 'location'): string {
  if (column === 'plural') return (object.pluralLabel ?? '').toLowerCase();
  if (column === 'location') return locationLabel(object.location).toLowerCase();
  return object.name.toLowerCase();
}

function matchesFilter(
  object: ObjectDefinitionDto,
  column: ObjectColumnKey,
  value: FilterValue,
): boolean {
  if (value.kind === 'select') {
    const values = value.values ?? [];
    if (values.length === 0) return true;
    return values.includes(object.location);
  }
  if (value.kind === 'text') {
    const query = (value.contains ?? '').trim().toLowerCase();
    if (query === '') return true;
    const haystack =
      column === 'plural' ? (object.pluralLabel ?? '').toLowerCase() : object.name.toLowerCase();
    return haystack.includes(query);
  }
  return true;
}

function compareBy(sort: SortState, left: ObjectDefinitionDto, right: ObjectDefinitionDto): number {
  const direction = sort.direction === 'asc' ? 1 : -1;
  if (sort.column === 'records') return (left.recordsCount - right.recordsCount) * direction;
  if (sort.column === 'fieldCount') return (left.fieldsCount - right.fieldsCount) * direction;
  const column = sort.column === 'plural' || sort.column === 'location' ? sort.column : 'name';
  return textFor(left, column).localeCompare(textFor(right, column)) * direction;
}

export function selectObjectsView(
  objects: ObjectDefinitionDto[],
  sort: SortState | undefined,
  filters: ObjectsFilters,
  page: number,
  pageSize: number,
): ObjectsView {
  const activeFilters = (Object.entries(filters) as [ObjectColumnKey, FilterValue][]).filter(
    ([, value]) => isFilterActive(value),
  );

  const filtered = objects.filter((object) =>
    activeFilters.every(([column, value]) => matchesFilter(object, column, value)),
  );

  const sorted = sort
    ? [...filtered].sort((left, right) => compareBy(sort, left, right))
    : filtered;

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const rows = sorted.slice(startIndex, startIndex + pageSize);

  return {
    rows,
    total,
    totalPages,
    start: total === 0 ? 0 : startIndex + 1,
    end: Math.min(startIndex + pageSize, total),
  };
}

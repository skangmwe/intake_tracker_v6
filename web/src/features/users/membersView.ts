// Pure sort / filter / paginate for the S29 members list. The members endpoint returns the whole
// roster, so the list-surface chrome (sortable headers, per-column funnel filters, pagination) is
// applied client-side here — one pure function so it is unit-testable without rendering. Every data
// column is sortable and filterable: Name / Email are text-contains, Access level / Status are
// select, Last active is a date range.

import type { FilterValue, SortState } from '@/shared/components/Table';

import type { WorkspaceMemberDto } from '@shared/types';

/** The sortable / filterable data columns (the trailing actions column is neither). */
export type MemberColumnKey = 'name' | 'email' | 'level' | 'status' | 'lastActive';

/** A per-column funnel value, keyed by column. Absent = no filter on that column. */
export type MembersFilters = Partial<Record<MemberColumnKey, FilterValue>>;

export interface MembersView {
  rows: WorkspaceMemberDto[];
  total: number;
  totalPages: number;
  start: number;
  end: number;
}

/** A funnel value is "active" only once the user has entered something to filter on. */
export function isFilterActive(value: FilterValue | undefined): boolean {
  if (!value) return false;
  return Boolean(
    value.values?.length || value.from || value.to || value.contains?.trim() || value.expression?.trim(),
  );
}

function nameText(member: WorkspaceMemberDto): string {
  return (member.displayName ?? member.email).toLowerCase();
}

/** Milliseconds for sorting/filtering; null/invalid last-active sorts oldest so invited rows trail. */
function lastActiveMillis(member: WorkspaceMemberDto): number {
  if (member.lastActiveAt === null) return Number.NEGATIVE_INFINITY;
  const millis = new Date(member.lastActiveAt).getTime();
  return Number.isNaN(millis) ? Number.NEGATIVE_INFINITY : millis;
}

function matchesFilter(member: WorkspaceMemberDto, column: MemberColumnKey, value: FilterValue): boolean {
  if (value.kind === 'select') {
    const values = value.values ?? [];
    if (values.length === 0) return true;
    return values.includes(column === 'level' ? member.level : member.status);
  }
  if (value.kind === 'text') {
    const query = (value.contains ?? '').trim().toLowerCase();
    if (query === '') return true;
    const haystack = (column === 'name' ? (member.displayName ?? '') : member.email).toLowerCase();
    return haystack.includes(query);
  }
  if (value.kind === 'date') {
    if (!value.from && !value.to) return true;
    if (member.lastActiveAt === null) return false;
    const millis = lastActiveMillis(member);
    if (millis === Number.NEGATIVE_INFINITY) return false;
    if (value.from && millis < new Date(value.from).getTime()) return false;
    if (value.to && millis > new Date(`${value.to}T23:59:59`).getTime()) return false;
    return true;
  }
  return true;
}

function sortKey(member: WorkspaceMemberDto, column: string): string {
  if (column === 'email') return member.email.toLowerCase();
  if (column === 'level') return member.level;
  if (column === 'status') return member.status;
  return nameText(member);
}

function compareBy(sort: SortState, left: WorkspaceMemberDto, right: WorkspaceMemberDto): number {
  const direction = sort.direction === 'asc' ? 1 : -1;
  if (sort.column === 'lastActive') {
    return (lastActiveMillis(left) - lastActiveMillis(right)) * direction;
  }
  return sortKey(left, sort.column).localeCompare(sortKey(right, sort.column)) * direction;
}

export function selectMembersView(
  members: WorkspaceMemberDto[],
  sort: SortState | undefined,
  filters: MembersFilters,
  page: number,
  pageSize: number,
): MembersView {
  const activeFilters = (Object.entries(filters) as [MemberColumnKey, FilterValue][]).filter(
    ([, value]) => isFilterActive(value),
  );

  const filtered = members.filter((member) =>
    activeFilters.every(([column, value]) => matchesFilter(member, column, value)),
  );

  const sorted = sort ? [...filtered].sort((left, right) => compareBy(sort, left, right)) : filtered;

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

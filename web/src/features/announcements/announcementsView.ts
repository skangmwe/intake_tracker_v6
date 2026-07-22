// Pure sort / filter / paginate for the S23 manage announcements table. The manage endpoint returns
// the workspace's whole announcement set in one page, so the list-surface chrome (Posted sort, the
// Announcement text funnel, the footer count) is applied client-side here — one pure function so it is
// unit-testable without rendering. Matches the prototype: only ANNOUNCEMENT filters (text) and only
// POSTED sorts (by its timestamp).

import type { FilterValue, SortState } from '@/shared/components/Table';

import type { AnnouncementListRow } from '@shared/types';

/** The one filterable column (text) and the one sortable column, per the prototype. */
export type AnnouncementColumnKey = 'title';

export type AnnouncementsFilters = Partial<Record<AnnouncementColumnKey, FilterValue>>;

export interface AnnouncementsView {
  rows: AnnouncementListRow[];
  total: number;
  totalPages: number;
  start: number;
  end: number;
}

/** A funnel value is "active" only once the user has typed something to filter on. */
export function isFilterActive(value: FilterValue | undefined): boolean {
  if (!value) return false;
  return Boolean(value.values?.length || value.contains?.trim());
}

/** Milliseconds for the POSTED value; rows without a posted timestamp sort last. */
function postedMs(row: AnnouncementListRow): number {
  if (!row.postedAt) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(row.postedAt);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function matchesTitle(row: AnnouncementListRow, value: FilterValue): boolean {
  const query = (value.contains ?? '').trim().toLowerCase();
  if (query === '') return true;
  return row.title.toLowerCase().includes(query);
}

export function selectAnnouncementsView(
  announcements: AnnouncementListRow[],
  sort: SortState | undefined,
  filters: AnnouncementsFilters,
  page: number,
  pageSize: number,
): AnnouncementsView {
  const titleFilter = filters.title;
  const filtered =
    titleFilter && isFilterActive(titleFilter)
      ? announcements.filter((row) => matchesTitle(row, titleFilter))
      : announcements;

  const sorted =
    sort?.column === 'posted'
      ? [...filtered].sort(
          (left, right) => (postedMs(left) - postedMs(right)) * (sort.direction === 'asc' ? 1 : -1),
        )
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

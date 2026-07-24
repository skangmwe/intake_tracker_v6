// Date grouping for the timeline and agenda views (Slice 24). Buckets items by their ISO `dateValue`
// (day granularity), returns the day groups in ascending chronological order, and collects items with no
// date into a trailing "No date" group. Pure — unit-tested independently of the renderers.

import { formatDate } from '@/shared/utils/dateFormat';

import type { RecordViewItem } from './types';

export const NO_DATE = 'No date';

export interface DateGroup {
  /** `YYYY-MM-DD` for a real day, or NO_DATE. Stable React key. */
  key: string;
  /** Human label — a locale date (`07/16/2026`), or "No date". */
  label: string;
  items: RecordViewItem[];
}

/** ISO date (`2026-07-16` or a full timestamp) → a locale date (`07/16/2026`). Raw string when unparseable. */
export function formatDayLabel(isoDay: string): string {
  const [yearPart, monthPart, dayPart] = isoDay.slice(0, 10).split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  if (!year || !month || !day || month < 1 || month > 12) return isoDay;
  // Build a local-midnight Date from the parsed parts (never `new Date(isoDay)`, which parses as UTC)
  // so the label never shifts a day across time zones; formatDate renders it in the viewer's locale.
  return formatDate(new Date(year, month - 1, day));
}

export function groupByDate(items: RecordViewItem[]): DateGroup[] {
  const dated = new Map<string, RecordViewItem[]>();
  const undated: RecordViewItem[] = [];

  for (const item of items) {
    const day = item.dateValue ? item.dateValue.slice(0, 10) : '';
    if (!day) {
      undated.push(item);
      continue;
    }
    const bucket = dated.get(day);
    if (bucket) bucket.push(item);
    else dated.set(day, [item]);
  }

  const groups: DateGroup[] = [...dated.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, groupItems]) => ({ key, label: formatDayLabel(key), items: groupItems }));

  if (undated.length > 0) {
    groups.push({ key: NO_DATE, label: NO_DATE, items: undated });
  }

  return groups;
}

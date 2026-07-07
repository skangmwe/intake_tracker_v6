// Pure presentation helpers for the dashboards feature — drill-through labels, date formatting, and the
// per-viewer narrowing of a widget's `data` union. Kept side-effect-free and unit-tested
// (web-file-structure.md — utils are pure). The drill label copy mirrors the prototype exactly.

import type { DashboardDrillFilter, DashboardWidgetDto } from '@shared/types';

export const EM_DASH = '—';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO `YYYY-MM-DD` → `28 Jun` (matches the prototype's dateLabel). Null / malformed → em-dash. */
export function formatDashDate(iso: string | null | undefined): string {
  if (!iso) return EM_DASH;
  const [, monthPart, dayPart] = iso.slice(0, 10).split('-');
  const month = Number(monthPart);
  const day = Number(dayPart);
  if (!month || !day || month < 1 || month > 12) return EM_DASH;
  return `${day} ${MONTHS[month - 1] ?? ''}`;
}

/** The drill-through pill label for the embedded records grid (prototype `dashFilterLabel`). */
export function drillLabel(filter: DashboardDrillFilter | undefined): string {
  if (!filter) return '';
  switch (filter.type) {
    case 'origin':
      return `Origin · ${filter.value}`;
    case 'category':
      return `Status · ${filter.value}`;
    case 'outcome':
      return `Closed · ${filter.value}`;
    case 'cell':
      return `${filter.origin} × ${filter.category}`;
    case 'closedCell':
      return `${filter.origin} × ${filter.outcome} (closed)`;
    case 'unassigned':
      return 'Unassigned past Intake';
    default:
      return '';
  }
}

/**
 * Narrow a widget's `data` (wire type `unknown`) to the shape implied by its `type`. The API resolver
 * guarantees the pairing per widget type; a single, centralised assertion keeps the individual widget
 * components free of scattered casts.
 */
export function widgetData<T>(widget: DashboardWidgetDto): T {
  // The `data` field is `unknown` on the wire and discriminated by `widget.type`; the resolver pairs
  // each type with its matching shape, so this assertion is the one narrowing point.
  return widget.data as T;
}

/** Count → em-dash for zero, else the number as a string (heatmap + grid cells). */
export function cellCount(count: number): string {
  return count === 0 ? EM_DASH : String(count);
}

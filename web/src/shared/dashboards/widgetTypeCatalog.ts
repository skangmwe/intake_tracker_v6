// The single source of truth for the multi-dashboard composer's widget palette (slice 28). Used by
// both the WidgetComposerSheet (to render its type / metric / group-by / width options) and the
// composed-card renderer (to know which config each widget type reads). The four composer kinds map
// onto the shared WidgetType union; the metric + dimension vocabularies match the API's composed
// resolvers exactly (usp_GetDashboardComposedKpi / …Breakdown).

import type { ComposedWidgetDimension, ComposedWidgetMetric, WidgetType } from '@shared/types';

export interface CatalogOption<TValue extends string> {
  value: TValue;
  label: string;
}

/** The four composer widget kinds (prototype S6), in menu order. */
export const COMPOSER_WIDGET_TYPES: ReadonlyArray<CatalogOption<WidgetType>> = [
  { value: 'kpi-tile', label: 'Metric (KPI)' },
  { value: 'bar-breakdown', label: 'Breakdown bars' },
  { value: 'segmented-bar', label: 'Pipeline segments' },
  { value: 'records-grid', label: 'Records table' },
];

/** KPI aggregate options (map 1:1 to the API's composed KPI metrics). */
export const COMPOSER_METRICS: ReadonlyArray<CatalogOption<ComposedWidgetMetric>> = [
  { value: 'count', label: 'Open request count' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'high-priority', label: 'High priority (5+)' },
];

/** Group-by dimensions for breakdown / pipeline widgets. */
export const COMPOSER_DIMENSIONS: ReadonlyArray<CatalogOption<ComposedWidgetDimension>> = [
  { value: 'origin', label: 'Dept/PG/Client' },
  { value: 'stage', label: 'Stage' },
  { value: 'analyst', label: 'Assigned analyst' },
  { value: 'priority', label: 'Priority' },
];

/** Default row cap for a composed records-table widget (prototype default). */
export const COMPOSER_DEFAULT_ROW_LIMIT = 6;

/** A KPI widget needs a metric. */
export function widgetNeedsMetric(type: WidgetType): boolean {
  return type === 'kpi-tile';
}

/** Breakdown + pipeline widgets need a group-by dimension. */
export function widgetNeedsDimension(type: WidgetType): boolean {
  return type === 'bar-breakdown' || type === 'segmented-bar';
}

/** A records-table widget needs a row limit. */
export function widgetNeedsRowLimit(type: WidgetType): boolean {
  return type === 'records-grid';
}

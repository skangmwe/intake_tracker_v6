// Pure helpers for the multi-dashboard composer (slice 28): the widget-editor draft shape, its
// conversion to/from the wire types, validation, and the scope-label string shown under a composed
// widget's title. No React, no I/O — unit-tested directly.

import type {
  ComposedWidgetDimension,
  ComposedWidgetMetric,
  DashboardWidgetConfig,
  DashboardWidgetDto,
  WidgetComposeRequest,
  WidgetId,
  WidgetType,
  WidgetWidth,
} from '@shared/types';

import {
  COMPOSER_DEFAULT_ROW_LIMIT,
  widgetNeedsDimension,
  widgetNeedsMetric,
  widgetNeedsRowLimit,
} from '@/shared/dashboards/widgetTypeCatalog';

/** The widget-editor's working state — one flat object the sheet binds to. */
export interface WidgetDraft {
  /** Present when editing an existing widget; absent when adding a new one. */
  id?: string;
  type: WidgetType;
  title: string;
  metric: ComposedWidgetMetric;
  groupByDimension: ComposedWidgetDimension;
  rowLimit: number;
  width: WidgetWidth;
  depts: string[];
  stages: string[];
}

export function emptyWidgetDraft(): WidgetDraft {
  return {
    type: 'kpi-tile',
    title: '',
    metric: 'count',
    groupByDimension: 'origin',
    rowLimit: COMPOSER_DEFAULT_ROW_LIMIT,
    width: 'Half',
    depts: [],
    stages: [],
  };
}

export function draftFromWidget(widget: DashboardWidgetDto): WidgetDraft {
  const config = widget.config;
  return {
    id: widget.id,
    type: widget.type,
    title: widget.title,
    metric: config.composedMetric ?? 'count',
    groupByDimension: config.groupByDimension ?? 'origin',
    rowLimit: config.rowLimit ?? COMPOSER_DEFAULT_ROW_LIMIT,
    width: config.width ?? 'Half',
    depts: config.depts ?? [],
    stages: config.stages ?? [],
  };
}

/** Build the wire request from a draft, including only the fields the chosen type reads. */
export function draftToComposeRequest(draft: WidgetDraft, sortOrder: number): WidgetComposeRequest {
  const request: WidgetComposeRequest = {
    type: draft.type,
    title: draft.title.trim(),
    width: draft.width,
    depts: draft.depts,
    stages: draft.stages,
    sortOrder,
  };
  if (draft.id) {
    request.id = draft.id as WidgetId;
  }
  if (widgetNeedsMetric(draft.type)) {
    request.metric = draft.metric;
  }
  if (widgetNeedsDimension(draft.type)) {
    request.groupByDimension = draft.groupByDimension;
  }
  if (widgetNeedsRowLimit(draft.type)) {
    request.rowLimit = draft.rowLimit;
  }
  return request;
}

export function isWidgetDraftValid(draft: WidgetDraft): boolean {
  return draft.title.trim().length > 0;
}

/** Toggle a value in a scope array (dept/stage checkbox). */
export function toggleScopeValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

/**
 * The "All departments" / "Finance · Build" line shown under a composed widget's title. `stageLabels`
 * maps a stored stage key to its display label; an unmapped key falls back to the key itself.
 */
export function scopeLabel(
  config: DashboardWidgetConfig,
  stageLabels: Record<string, string>,
): string {
  const depts = config.depts ?? [];
  const stages = config.stages ?? [];
  const deptPart = depts.length > 0 ? depts.join(', ') : 'All departments';
  if (stages.length === 0) {
    return deptPart;
  }
  const stagePart = stages.map((key) => stageLabels[key] ?? key).join(', ');
  return `${deptPart} · ${stagePart}`;
}

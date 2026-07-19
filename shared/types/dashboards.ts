// Dashboards (Slice 23 — BS §10.2-§10.5, api-contracts.md §15, module-boundaries.md §15).
//
// R1 ships three seeded fixed-layout dashboards on the AI Solutions workspace (ai-default S6,
// ai-workload S14, feature-catalog S12) plus a starter dashboard stamped into every PG/Dept
// workspace (pg-starter S15). A dashboard is a row that carries a `widgets` list (JSON on the
// SavedDashboard row) — each widget names a fixed metric the API resolves per viewer at read
// time. There is no no-code builder in R1; the widget list is authored by the seed and cloned
// on provision, so a workspace's dashboards are its own local objects (§10.5).
//
// Every widget result resolves to the caller's entitlements — a dashboard NEVER widens access.
// The Dashboard-viewer surface (S16) renders one bound dashboard read-only with drill-through
// suppressed; the full surface (S6) drives its embedded records grid via drill-through.

import type {
  AnnouncementAudience,
} from './announcements';
import type {
  IsoDateTime,
  SavedDashboardId,
  SavedViewId,
  WidgetId,
  WorkspaceId,
} from './common';

// ── Widget palette (BS §10.2 — the fixed set of eight types) ───────────────

export type WidgetType =
  | 'kpi-tile'
  | 'kpi-with-trend'
  | 'segmented-bar'
  | 'bar-breakdown'
  | 'histogram'
  | 'line-timeseries'
  | 'heatmap-matrix'
  | 'records-grid';

/**
 * The metric a widget points at (the library subset R1 seeds — §10.6). The API has exactly one
 * resolver per member; there is no generic query engine in R1. Unknown metric → the widget
 * resolves to an empty result rather than failing the whole dashboard.
 */
export type DashboardMetric =
  | 'pipeline-by-category' // segmented bar — open records across the 4 status categories (S6)
  | 'escalations-by-quarter-origin' // kpi-with-trend + per-origin breakdown, this quarter (S6)
  | 'unassigned-past-intake' // kpi tile + per-origin breakdown (S6, S14)
  | 'closures-by-outcome' // bar breakdown by Outcome, this quarter (S6)
  | 'origin-by-status-heatmap' // heatmap Dept/PG/Client × [4 categories | 4 closed outcomes] (S6)
  | 'open-per-analyst' // bar breakdown — open records per assigned analyst (S14)
  | 'pending-signoff' // kpi tile — records with ≥1 open approval request (S14)
  | 'median-time-to-triage' // kpi-with-trend — rolling window (S14)
  | 'aging-in-stage' // histogram — open records bucketed by days-in-stage (S14)
  | 'features-published' // kpi tile — Published feature count (S12)
  | 'features-by-type' // bar breakdown over Feature type (S12)
  | 'features-by-tech' // bar breakdown over Tech / Stack (S12)
  | 'requests-by-origin' // bar breakdown over Dept/PG/Client (S15 PG starter)
  | 'escalation-status' // kpi tile — AI Solutions Status set vs blank (S15 PG starter)
  | 'records-grid'; // saved-view-driven records list with drill-through + export

export type DashboardObjectType = 'Request' | 'Feature';

// ── Composed-widget vocabulary (v2, slice 28 — the S6 composer) ─────────────
// Composed dashboards do NOT use the fixed `DashboardMetric` resolvers above — they carry a small
// generic aggregate/group-by vocabulary the composer offers (prototype S6). The API resolves these
// live over the scoped open records; empty scope arrays mean "all".

/** KPI composed widgets — the aggregate over the scoped open records. */
export type ComposedWidgetMetric = 'count' | 'unassigned' | 'overdue' | 'high-priority';

/** Breakdown / pipeline composed widgets — the dimension to group by. */
export type ComposedWidgetDimension = 'origin' | 'stage' | 'analyst' | 'priority';

/** Composed layout width — half places two widgets per row; full spans the row. */
export type WidgetWidth = 'Half' | 'Full';

/**
 * Widget config stored on the row (JSON) and echoed on read. Type-aware but wire-open. Fixed
 * (seeded) widgets carry `metric` (+ optional `objectType` / `savedViewId`). Composed widgets carry
 * the composed vocabulary (`composedMetric` / `groupByDimension` / `rowLimit` / scope / `width` /
 * `sortOrder`). A widget never carries both halves; the dashboard's `layoutMode` selects which the
 * resolver reads.
 */
export interface DashboardWidgetConfig {
  /** Fixed (seeded) dashboards — the named resolver this widget points at. Absent on composed widgets. */
  metric?: DashboardMetric;
  /** Object the widget reads (records-grid + feature metrics). Defaults to the dashboard's objectType. */
  objectType?: DashboardObjectType;
  /** For a records-grid widget — the saved view whose columns/sort drive the grid. */
  savedViewId?: SavedViewId;
  /** Composed KPI widgets — the aggregate to compute. */
  composedMetric?: ComposedWidgetMetric;
  /** Composed breakdown / pipeline widgets — the group-by dimension. */
  groupByDimension?: ComposedWidgetDimension;
  /** Composed records-table widgets — max rows shown. */
  rowLimit?: number;
  /** Composed layout — half-width places two widgets in a row; full-width takes the row. */
  width?: WidgetWidth;
  /** Composed insertion order within the dashboard. */
  sortOrder?: number;
  /** Composed scope filter — dept/PG/client labels; empty (or absent) = every department. */
  depts?: string[];
  /** Composed scope filter — stage keys; empty (or absent) = every stage. */
  stages?: string[];
}

// ── Drill-through (S6 only; suppressed on the S16 viewer) ───────────────────
// Mirrors the prototype's dashFilter shapes: a click on a segment / tile / heatmap cell filters
// the embedded records grid. Passed to GET /dashboards/{id}?drill=<url-encoded-json>.

export type DashboardDrillFilter =
  | { type: 'origin'; value: string }
  | { type: 'category'; value: string }
  | { type: 'outcome'; value: string }
  | { type: 'cell'; origin: string; category: string }
  | { type: 'closedCell'; origin: string; outcome: string }
  | { type: 'unassigned' };

// ── Widget result shapes (the `data` union, narrowed by widget type) ────────

/** One labelled magnitude in a bar / segmented / histogram widget. */
export interface WidgetSegment {
  label: string;
  count: number;
  /** 0–100, share of the widget's basis (segmented = of total; bar/histogram = of the max). */
  percent: number;
}

export interface KpiBreakdownEntry {
  label: string;
  count: number;
}

export interface KpiTileData {
  value: number;
  caption?: string;
  breakdown?: KpiBreakdownEntry[];
}

export interface KpiTrendData {
  value: number;
  unit?: string;
  /** Signed delta vs the prior period. */
  delta: number;
  deltaLabel: string;
  breakdown?: KpiBreakdownEntry[];
}

export interface SegmentedBarData {
  total: number;
  segments: WidgetSegment[];
}

export interface BarBreakdownData {
  bars: WidgetSegment[];
}

export interface HistogramData {
  buckets: WidgetSegment[];
}

export interface TimeSeriesData {
  points: Array<{ label: string; value: number }>;
}

export interface HeatmapColumn {
  label: string;
  /** Column group header ('In flight' | 'Closed') — the first column of a new group carries it. */
  group?: string;
  /** True on the first column of the 'Closed' group so the UI draws the divider. */
  groupStart?: boolean;
}

export interface HeatmapCell {
  count: number;
}

export interface HeatmapRow {
  label: string;
  cells: HeatmapCell[];
}

export interface HeatmapMatrixData {
  columns: HeatmapColumn[];
  rows: HeatmapRow[];
}

/** A records-grid widget's resolved page (drill-through applied server-side when a drill is passed). */
export interface DashboardGridRow {
  id: string;
  name: string;
  stage: string;
  origin: string;
  analyst: string;
  priority: number;
  due: string | null;
  /** The record's status category, so the S6 grid can label a closed drill. */
  statusCategory?: string;
  /** True for a closed record surfaced by an outcome/closed-cell drill (not openable). */
  closed?: boolean;
}

export interface RecordsGridData {
  objectType: DashboardObjectType;
  savedViewId?: SavedViewId;
  columns: string[];
  count: number;
  rows: DashboardGridRow[];
}

// ── Dashboard DTOs ─────────────────────────────────────────────────────────

export type DashboardSlug = 'ai-default' | 'ai-workload' | 'feature-catalog' | 'pg-starter';

export interface DashboardWidgetDto {
  id: string;
  type: WidgetType;
  title: string;
  config: DashboardWidgetConfig;
  /** Result data resolved per viewer — narrow by `type` (KpiTileData, SegmentedBarData, …). */
  data: unknown;
}

/** GET /dashboards/{id} — the full dashboard with every widget resolved to the caller. */
export interface SavedDashboardDto {
  id: SavedDashboardId;
  workspaceId: WorkspaceId;
  /** Null on user-composed dashboards (only the four seeded starters carry a slug). */
  slug: DashboardSlug | null;
  name: string;
  description?: string;
  audience: AnnouncementAudience;
  isDefault: boolean;
  objectType: DashboardObjectType;
  /** False on the locked Dashboard-viewer surface (S16); true on the full S6 surface. */
  supportsDrillThrough: boolean;
  widgets: DashboardWidgetDto[];
  /**
   * v2 (slice 28). True on the four seeded dashboards (AI-default, Workload, Feature Catalog,
   * PG-starter). Seeded dashboards keep their fixed layout and are read-only on the composer path:
   * PATCH against a seeded dashboard returns 403 `seeded-dashboard-read-only`.
   */
  isSeeded?: boolean;
  /**
   * v2 (slice 28). `Shared` dashboards render on the Dashboards switcher for every member of the
   * audience; `Personal` dashboards render only for their author. Defaults to `Shared` for
   * backward compat with the seeded rows.
   */
  visibility?: 'Shared' | 'Personal';
  /**
   * v2 (slice 28). `Fixed` = the seeded four-tile / heatmap / grid layout (code-driven);
   * `Composed` = user-authored via the widget composer. Composed dashboards render from
   * `widgets` in order; Fixed dashboards ignore `widgets` order for layout (still resolve data).
   */
  layoutMode?: 'Fixed' | 'Composed';
}

/** One row of the Dashboards list (S17 + S6 switcher) — metadata only, no widget data. */
export interface DashboardListItemDto {
  id: SavedDashboardId;
  /** Null on user-composed dashboards (only the four seeded starters carry a slug). */
  slug: DashboardSlug | null;
  workspaceId: WorkspaceId;
  name: string;
  description?: string;
  audience: AnnouncementAudience;
  isDefault: boolean;
  objectType: DashboardObjectType;
  widgetCount: number;
  updatedAt: IsoDateTime;
  /**
   * v2 (slice 28). Groups the S6 switcher into Shared vs Personal. Optional for backward compat
   * with pre-v2 fixtures (the API always populates it); a missing value is treated as Shared.
   */
  visibility?: 'Shared' | 'Personal';
  /** v2 (slice 28). `Fixed` seeded starters vs `Composed` user dashboards. */
  layoutMode?: 'Fixed' | 'Composed';
  /** v2 (slice 28). True on the four seeded starters (read-only on the composer path). */
  isSeeded?: boolean;
}

/** GET /workspaces/{id}/dashboards (S17 + S32 management list). */
export interface DashboardListDto {
  workspaceId: WorkspaceId;
  items: DashboardListItemDto[];
}

/**
 * PATCH /dashboards/{id} — audience/name edit + retire (S32 management, WorkspaceAdmin), plus the
 * composer's layout/visibility edits (slice 28). `name` / `audience` / `retire` are allowed on any
 * dashboard including seeded ones (S32); `visibility` and `widgets` are composer-path fields and are
 * rejected on a seeded dashboard with 403 `seeded-dashboard-read-only`.
 */
export interface DashboardPatchRequest {
  name?: string;
  audience?: AnnouncementAudience;
  /** When true, soft-retire the dashboard (removes it from the list). */
  retire?: boolean;
  /** v2 (slice 28). Toggle between Shared and Personal on a composed dashboard (composer path). */
  visibility?: 'Shared' | 'Personal';
  /** v2 (slice 28). Replace the composed dashboard's ordered widget list (reorder / bulk layout). */
  widgets?: WidgetComposeRequest[];
}

/**
 * v2 (slice 28). POST /workspaces/{id}/dashboards — create a user-composed dashboard.
 * Seeded dashboards cannot be created here (they exist only via workspace provisioning).
 */
export interface DashboardComposeRequest {
  name: string;
  description?: string;
  /**
   * Optional — composed dashboards are created `everyone`-audience server-side; `visibility` governs
   * list membership. Kept for forward compat; the create endpoint does not read it.
   */
  audience?: AnnouncementAudience;
  visibility: 'Shared' | 'Personal';
  objectType: DashboardObjectType;
  /** Ordered initial widget list; may be empty (composer adds widgets one by one). */
  widgets?: WidgetComposeRequest[];
}

/**
 * v2 (slice 28). Body for POST/PATCH on a composed dashboard's widgets, and each entry of a
 * `DashboardComposeRequest.widgets` / `DashboardPatchRequest.widgets` list. The API validates each
 * request against the composer's type → required-field schema (see the WidgetTypeCatalog):
 * `kpi-tile` needs `metric`; `bar-breakdown` / `segmented-bar` need `groupByDimension`;
 * `records-grid` uses `rowLimit`.
 */
export interface WidgetComposeRequest {
  /** Present on PATCH / a full-list replace; server-assigns on a bare POST. */
  id?: WidgetId;
  type: WidgetType;
  /** Display title of the widget. */
  title: string;
  /** Present on kpi-tile. */
  metric?: ComposedWidgetMetric;
  /** Present on bar-breakdown / segmented-bar. */
  groupByDimension?: ComposedWidgetDimension;
  /** Present on records-grid. */
  rowLimit?: number;
  /** Layout — half-width places two widgets in a row; full-width takes the full row. */
  width: WidgetWidth;
  /** Scope filter — dept/PG/client labels; empty = every department. */
  depts?: string[];
  /** Scope filter — stage keys; empty = every stage. */
  stages?: string[];
  /** Insertion order within the dashboard. */
  sortOrder: number;
}

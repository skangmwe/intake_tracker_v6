// Notifications, event spine, home surface, search, saved views, dashboards.

import type {
  AnnouncementId,
  IsoDateTime,
  RecordId,
  SavedDashboardId,
  SavedViewId,
  UserId,
  WorkspaceId,
} from './common';

// ── Event spine ─────────────────────────────────────────────────────────
// Every meaningful state change emits exactly one typed event on the spine.
// Four consumers read: Audit, AI Solutions Status mirror, Notifications, Dashboards.

export type EventType =
  // Record lifecycle
  | 'request.created'
  | 'request.updated'
  | 'request.hold.set'
  | 'request.hold.cleared'
  | 'request.stage.advanced'
  | 'request.closed'
  // Gates
  | 'gate.opened'
  | 'gate.decision.submitted'
  | 'gate.re-requested'
  | 'gate.resolved'
  // Escalation
  | 'escalation.opened'
  | 'escalation.crossed-field.snapshotted'
  // Feature Catalog
  | 'feature.created'
  | 'feature.published'
  | 'feature.deprecated'
  // Announcements
  | 'announcement.published'
  // Tasks
  | 'task.created'
  | 'task.updated'
  | 'task.done'
  // Comments
  | 'comment.posted'
  | 'comment.mention.fired'
  // Attachments
  | 'attachment.uploaded'
  // Config
  | 'config.field.updated'
  | 'config.gate.updated'
  | 'config.workspace.provisioned';

/**
 * The event envelope emitted on the spine. Consumed by Audit (durable), Mirror,
 * Notifications, Dashboards. Never emits twice.
 */
export interface EventEnvelope {
  eventId: string;
  eventType: EventType;
  workspaceId: WorkspaceId;
  recordId?: RecordId;
  actorUserId?: UserId;
  eventAt: IsoDateTime;
  /** Structured payload — old→new for updates, slot context for gate events, etc. */
  payload: Record<string, unknown>;
  /** Correlation for tracing — the OperationId of the request that produced this. */
  operationId: string;
}

// ── Notifications ────────────────────────────────────────────────────────

export type NotificationCategory =
  | 'sign-off-requested'
  | 'gate-decided'
  | 'assigned-to-you'
  | 'escalation-received'
  | 'hold-changed'
  | 'mentioned'
  | 'announcement-posted'
  | 'closed';

export interface NotificationDto {
  id: string;
  category: NotificationCategory;
  /** For per-record notifications, the record targeted. */
  recordId?: RecordId;
  /** For an 'announcement-posted' notification, the announcement the bell deep-links to (S21). */
  announcementId?: AnnouncementId;
  /** Human-readable message the UI renders. */
  summary: string;
  createdAt: IsoDateTime;
  readAt?: IsoDateTime;
  /** The event on the spine that produced this notification (for debug/trace). */
  sourceEventId: string;
}

/** POST /notifications/query body — paginated bell feed for the caller. */
export interface NotificationQuery {
  page: number;
  pageSize: number;
  /** When true, only unread notifications are returned. */
  unreadOnly: boolean;
}

/** GET /notifications/unread-count — the bell badge count (caller-scoped, all workspaces). */
export interface UnreadCountDto {
  count: number;
}

// Home surface (BS §10.7) — the composite payload + panel item shapes moved to home.ts when slice 22
// implemented S1 (the scaffold's placeholder Home types lived here; the real ones are the dedicated
// per-surface file). See shared/types/home.ts.

// ── Search ───────────────────────────────────────────────────────────────

export interface SearchHitDto {
  recordId: RecordId;
  name: string;
  stage?: string;
  origin?: string;
}

export interface SearchResultDto extends SearchHitDto {
  /** What matched — record, comment, attachment filename. */
  matchKind: 'record' | 'comment' | 'attachment';
  /** Highlighted snippet the UI renders. */
  snippet: string;
}

// ── Saved views ──────────────────────────────────────────────────────────

export type SavedViewScope = 'personal' | 'shared';

/**
 * The list surface a saved view binds to (slice 14). A view is scoped to one object type so a
 * Request view never appears on the Feature Catalog picker and vice versa.
 */
export type SavedViewObjectType = 'Request' | 'Feature' | 'Task' | 'Announcement';

export interface SavedViewDto {
  id: SavedViewId;
  workspaceId: WorkspaceId;
  objectType: SavedViewObjectType;
  name: string;
  scope: SavedViewScope;
  isDefault: boolean;
  columns: string[];
  filters: Record<string, import('./common').FilterClause>;
  sort: Array<{ column: string; direction: 'asc' | 'desc' }>;
  /** The owning user — personal views are visible only to their owner. */
  ownerUserId: UserId;
  createdBy: UserId;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface SavedViewUpsertRequest {
  objectType: SavedViewObjectType;
  name: string;
  scope: SavedViewScope;
  isDefault?: boolean;
  columns: string[];
  filters?: Record<string, import('./common').FilterClause>;
  sort?: Array<{ column: string; direction: 'asc' | 'desc' }>;
}

// ── Dashboards (BS §10.2, palette of 8 widget types) ────────────────────

export type WidgetType =
  | 'kpi-tile'
  | 'kpi-with-trend'
  | 'segmented-bar'
  | 'bar-breakdown'
  | 'histogram'
  | 'line-timeseries'
  | 'heatmap-matrix'
  | 'records-grid';

export interface DashboardWidgetDto {
  id: string;
  type: WidgetType;
  title: string;
  /** Widget-specific config. Type-aware — validated per widget type. */
  config: Record<string, unknown>;
  /** Result data resolved per viewer. */
  data: unknown;
}

export interface SavedDashboardDto {
  id: SavedDashboardId;
  workspaceId: WorkspaceId;
  name: string;
  audience: import('./announcements').AnnouncementAudience;
  widgets: DashboardWidgetDto[];
}

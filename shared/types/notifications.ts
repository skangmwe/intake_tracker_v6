// Notifications, event spine, home surface, search, saved views, dashboards.

import type {
  ApprovalRequestId,
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

// ── Home surface (BS §10.7) ─────────────────────────────────────────────

/**
 * Home surface composite payload — assembles viewer-scoped queries for the panels.
 * Each panel is capped and access-respecting.
 */
export interface HomeDto {
  needsYourDecision: HomeApprovalItem[];
  yourWorkToday: HomeRecordItem[];
  sinceYouWereLastHere: HomeActivityItem[];
  newToTriage: HomeRecordItem[];
  pinnedAnnouncements: import('./announcements').AnnouncementDto[];
}

export interface HomeApprovalItem {
  approvalRequestId: ApprovalRequestId;
  recordId: RecordId;
  recordName: string;
  gateName: string;
  fromStage: string;
  toStage: string;
  /** The slot(s) the caller is eligible on. */
  eligibleSlots: number[];
}

export interface HomeRecordItem {
  recordId: RecordId;
  name: string;
  displayStatus: string;
  dueDate?: string;
  slaStatus?: import('./requests').SlaStatus;
  origin?: string;
}

export interface HomeActivityItem {
  recordId: RecordId;
  recordName: string;
  eventType: EventType;
  eventAt: IsoDateTime;
  summary: string;
}

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

export interface SavedViewDto {
  id: SavedViewId;
  workspaceId: WorkspaceId;
  name: string;
  scope: SavedViewScope;
  isDefault: boolean;
  columns: string[];
  filters: Record<string, import('./common').FilterClause>;
  sort: Array<{ column: string; direction: 'asc' | 'desc' }>;
  createdBy: UserId;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface SavedViewUpsertRequest {
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

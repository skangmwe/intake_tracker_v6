// Audit-log surfaces (S33 workspace audit, slice 18; S39 firm-wide audit, slice 19).
// The AuditEntry table is append-only and immutable (BS §12) — these types are read-only projections
// of it for the log surface. This is distinct from AuditEventItem in collaboration.ts, which is the
// per-record activity-thread projection; the log surface carries the record + object type + actor
// display name so an admin can scan a workspace-wide chronological feed without a second fetch.

import type { EventType } from './notifications';
import type { IsoDate, IsoDateTime, PaginatedQuery, RecordId, UserId, WorkspaceId } from './common';

/**
 * One row of the workspace audit log (S33). `actorUserId` is the Entra `oid` (never PII); `actorName`
 * is the resolved display name for the table, carried so the row renders without a directory fetch
 * (mirrors slice 8's FrozenApproverSlot / slice 12's WatcherListItemDto). `recordId` / `objectType`
 * are null for workspace-level or config events. `payloadSummary` is the already-sanitised structured
 * payload (old→new, slot context, escalation source/target) the UI renders — never raw PII beyond what
 * the entitled admin may read (api-pii-handling.md governs logs, not entitled reads).
 */
export interface AuditLogRowDto {
  auditId: string;
  workspaceId: WorkspaceId;
  recordId: RecordId | null;
  objectType: string | null;
  eventType: EventType;
  actorUserId: UserId | null;
  actorName: string | null;
  eventAt: IsoDateTime;
  /** Raw structured JSON payload (already sanitised at emit time). The UI shapes it per event type. */
  payload: string;
}

/**
 * POST /workspaces/{id}/audit/query body — the S33 filter bar. Paginated (default 20, max 100 per
 * api/CLAUDE.md). Every filter is optional and ANDs with the others; an omitted filter is not applied.
 * Filters are first-class fields (not a generic FilterClause map) because the audit surface has a fixed
 * known filter set — date range, actor, record, event type.
 */
export interface AuditLogQuery extends Pick<PaginatedQuery, 'page' | 'pageSize'> {
  /** Inclusive lower bound on EventAt (date-only; the API treats it as start-of-day UTC). */
  dateFrom?: IsoDate;
  /** Inclusive upper bound on EventAt (date-only; the API treats it as end-of-day UTC). */
  dateTo?: IsoDate;
  /** Restrict to events by one actor. */
  actorUserId?: UserId;
  /** Restrict to events on one record. */
  recordId?: RecordId;
  /** Restrict to one event type. */
  eventType?: EventType;
}

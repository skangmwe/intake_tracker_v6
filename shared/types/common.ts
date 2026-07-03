// Shared vocabulary — common primitives and envelopes.
// Consumed by both web/ and api/. Do not edit without updating shared-types.md.

/** ISO-8601 UTC timestamp string. */
export type IsoDateTime = string;

/** ISO-8601 date-only string, e.g. "2026-07-03". */
export type IsoDate = string;

/**
 * Branded record identifier — `PREFIX-NNNNNNNN`.
 * The prefix is workspace-owned (globally unique via PrefixRegistry).
 * The 8-digit sequence is zero-padded; first minted record is PREFIX-00000001.
 */
export type RecordId = string & { readonly __brand: 'RecordId' };

/** Workspace GUID. */
export type WorkspaceId = string & { readonly __brand: 'WorkspaceId' };

/** User GUID — the Entra `oid` claim. The only user identifier permitted in logs. */
export type UserId = string & { readonly __brand: 'UserId' };

/** Field-definition GUID. */
export type FieldDefinitionId = string & { readonly __brand: 'FieldDefinitionId' };

/** Stage-definition GUID. */
export type StageDefinitionId = string & { readonly __brand: 'StageDefinitionId' };

/** Gate-definition GUID. */
export type GateDefinitionId = string & { readonly __brand: 'GateDefinitionId' };

/** ApprovalRequest GUID. */
export type ApprovalRequestId = string & { readonly __brand: 'ApprovalRequestId' };

/** Task GUID. */
export type TaskId = string & { readonly __brand: 'TaskId' };

/** Attachment GUID. */
export type AttachmentId = string & { readonly __brand: 'AttachmentId' };

/** Comment GUID. */
export type CommentId = string & { readonly __brand: 'CommentId' };

/** TypedLink GUID. */
export type TypedLinkId = string & { readonly __brand: 'TypedLinkId' };

/** Announcement GUID. */
export type AnnouncementId = string & { readonly __brand: 'AnnouncementId' };

/** Draft GUID. */
export type DraftId = string & { readonly __brand: 'DraftId' };

/** SavedView GUID. */
export type SavedViewId = string & { readonly __brand: 'SavedViewId' };

/** SavedDashboard GUID. */
export type SavedDashboardId = string & { readonly __brand: 'SavedDashboardId' };

/** Import job GUID. */
export type ImportId = string & { readonly __brand: 'ImportId' };

/**
 * Paginated response envelope. Every collection endpoint returns this.
 * Default pageSize is 20, max 100 (`api/CLAUDE.md`).
 */
export interface PaginatedResponse<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

/**
 * Paginated query request body. Every collection endpoint accepts this shape.
 * POST body per api/CLAUDE.md — no sensitive or complex parameters in query strings.
 */
export interface PaginatedQuery {
  page: number;
  pageSize: number;
  filters?: Record<string, FilterClause>;
  sort?: Array<{ column: string; direction: 'asc' | 'desc' }>;
  savedViewId?: SavedViewId;
}

/** A single filter clause bound to a column. Type-aware. */
export type FilterClause =
  | { kind: 'text'; contains: string }
  | { kind: 'select'; values: string[] }
  | { kind: 'number'; op: '>' | '>=' | '=' | '<=' | '<'; value: number }
  | { kind: 'date'; from?: IsoDate; to?: IsoDate }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'user'; userIds: UserId[] };

/**
 * RFC 7807 ProblemDetails — every error response.
 * Never contains stack traces or internal exception messages (api-error-handling.md).
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  operationId?: string;
  /** Set on validation failures — field name → messages. */
  errors?: Record<string, string[]>;
}

/**
 * Firm error codes the frontend consumes. Every code maps 1:1 to a ProblemDetails `type` URL suffix.
 */
export type ErrorCode =
  | 'pending-crossing-edits'
  | 'already-escalated'
  | 'duplicate-prefix'
  | 'filename-collision'
  | 'stale-record'
  | 'gate-already-open'
  | 'rejection-requires-comment'
  | 'access-denied'
  | 'platform-defined-field-locked'
  | 'not-found';

/** Access level per workspace. Platform admin is additive, not a level (see MeDto). */
export type AccessLevel = 'Viewer' | 'Member' | 'WorkspaceAdmin';

/** Workspace kind. */
export type WorkspaceKind = 'ai-solutions' | 'pg-dept' | 'pg-dept-template';

/**
 * UI theme preference. Persisted server-side (roams across devices) and mirrored to
 * `localStorage` for the pre-paint theme-init script (web-persistence.md).
 */
export type ThemePreference = 'light' | 'dark';

/** Object type — the one metadata engine underlies all record types. */
export type ObjectType = 'Request' | 'Task' | 'Feature' | 'Toolkit' | 'Announcement';

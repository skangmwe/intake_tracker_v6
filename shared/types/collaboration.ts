// Comments, typed links, attachments, watchers, activity thread.

import type {
  AttachmentId,
  CommentId,
  DraftId,
  IsoDateTime,
  ObjectType,
  RecordId,
  TypedLinkId,
  UserId,
  WorkspaceId,
} from './common';

// ── Comments ─────────────────────────────────────────────────────────────
// Comments are immutable (BS §9.3). No PATCH, no DELETE endpoints.

export interface CommentDto {
  id: CommentId;
  recordId: RecordId;
  objectType: ObjectType;
  authorUserId: UserId;
  body: string;
  mentionedUserIds: UserId[];
  createdAt: IsoDateTime;
}

export interface CommentCreateRequest {
  body: string;
  mentionedUserIds?: UserId[];
}

// ── Typed links (labeled "Relationships" in the prototype) ───────────────

export type TypedLinkKind = 'related' | 'duplicate-of' | 're-pursuit-of' | 'sourced-from';

/** The subset of link kinds a Copy / Promote link-back may use (BS §5). */
export type LinkBackKind = 'related' | 're-pursuit-of';

/**
 * One typed link on a record, resolved for the Relationships card (slice 10). `toName` / `toStage`
 * are the far record's display name + current stage, resolved access-respectingly — both null when
 * the caller cannot see the far side (the link shows, but only the id is revealed — BS §22.6).
 */
export interface TypedLinkDto {
  id: TypedLinkId;
  fromRecordId: RecordId;
  toRecordId: RecordId;
  kind: TypedLinkKind;
  rationale?: string;
  toName: string | null;
  toStage: string | null;
  createdAt: IsoDateTime;
}

export interface TypedLinkCreateRequest {
  toRecordId: RecordId;
  kind: TypedLinkKind;
  rationale?: string;
}

/**
 * A link-back queued on a Draft (slice 10). A draft has no RecordId, so this cannot be a TypedLink
 * yet — the create path stamps each queued link as a TypedLink from the newly-minted record.
 */
export interface QueuedLink {
  toRecordId: RecordId;
  kind: TypedLinkKind;
}

// ── Attachments ──────────────────────────────────────────────────────────
// Files follow the record (BS §2.3). Not governed by the crossing map.

export interface AttachmentDto {
  id: AttachmentId;
  recordId: RecordId;
  objectType: ObjectType;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  isLink: boolean;
  externalUrl?: string;
  uploadedAt: IsoDateTime;
  uploadedBy: UserId;
  /** Client-side URL to fetch the content — same-origin, authenticated. */
  contentUrl: string;
}

/** Attach an external URL to a record (no upload) — POST /records/{id}/attachments/link. */
export interface AttachmentLinkRequest {
  url: string;
  title: string;
}

// ── Watchers ─────────────────────────────────────────────────────────────
// Per-record subscription — never a crossing field (BS §17.3, §11.2).

export interface WatcherDto {
  recordId: RecordId;
  userId: UserId;
  subscribedAt: IsoDateTime;
}

/**
 * One watcher resolved for the record-detail Watchers card (slice 12). `displayName` is carried so
 * the avatar/initials render without a second directory fetch (mirrors slice 8's FrozenApproverSlot).
 *
 * v2 (slice 26): the caller's own row carries the five per-record preference booleans; other rows
 * omit them (a watcher never sees another watcher's preferences).
 */
export interface WatcherListItemDto {
  userId: UserId;
  displayName: string;
  subscribedAt: IsoDateTime;
  // v2 (slice 26) — per-record notification preferences. Present only on the caller's own row.
  notifyGateDecisions?: boolean;
  notifyStatusChanges?: boolean;
  notifyTaskSignoffs?: boolean;
  notifySlaAndDueDateReminders?: boolean;
  notifyMentionsAndComments?: boolean;
}

/**
 * The caller's own effective notification preferences for the record. v2 (slice 26 prototype
 * reconciliation) — always present (defaults all-true), independent of watch state, so the
 * preference toggles render always and persist even before the caller subscribes.
 */
export interface WatcherPreferences {
  notifyGateDecisions: boolean;
  notifyStatusChanges: boolean;
  notifyTaskSignoffs: boolean;
  notifySlaAndDueDateReminders: boolean;
  notifyMentionsAndComments: boolean;
}

/** GET /records/{id}/watchers — the roster plus the caller's own subscription state (drives the toggle). */
export interface WatcherListDto {
  watchers: WatcherListItemDto[];
  /** Whether the caller is currently watching — sets the Watch / Watching toggle without a client scan. */
  isWatching: boolean;
  /** The caller's own notification preferences — always present; drives the always-visible toggles. */
  myPreferences: WatcherPreferences;
}

/**
 * v2 (slice 26). PATCH /records/{recordId}/watchers/me — sparse update. Set individual
 * preference fields to toggle categorical delivery on/off; omit to leave unchanged.
 * When `isWatching=false`, the record leaves the caller's Watching list; preferences persist
 * so they're restored on re-subscribe.
 */
export interface WatcherPreferencesPatchRequest {
  isWatching?: boolean;
  notifyGateDecisions?: boolean;
  notifyStatusChanges?: boolean;
  notifyTaskSignoffs?: boolean;
  notifySlaAndDueDateReminders?: boolean;
  notifyMentionsAndComments?: boolean;
}

// ── Activity thread ─────────────────────────────────────────────────────
// The immutable interleaved view — comments + audit events (BS §9.3, §12).

export type ActivityThreadItem =
  | { kind: 'comment'; comment: CommentDto }
  | { kind: 'event'; event: AuditEventItem };

/** Audit-event projection for the activity thread. */
export interface AuditEventItem {
  eventType: string;
  eventAt: IsoDateTime;
  actorUserId?: UserId;
  /** Human-readable summary the UI renders — e.g. "changed Assigned Analyst: Priya → Sam". */
  summary: string;
  /** For field-change events, the (old, new) pair to render as `old → new`. */
  oldValue?: unknown;
  newValue?: unknown;
  /** For gate-decision events, the slot context: role label + signer. */
  gateContext?: {
    slotRoleLabel: string;
    signerUserId?: UserId;
    decision: 'Approved' | 'Rejected';
  };
}

/** Copy semantics — POST /records/{id}/copy. */
export interface CopyRequest {
  targetWorkspaceId: WorkspaceId;
  /** Carry attachments across on copy. Accepted now; carry-across lands with Attachments (slice 11). */
  includeAttachments: boolean;
  /** Optional link back from the new record to the source, stamped when the draft is submitted. */
  linkBackKind?: LinkBackKind;
}

/** 201 response for Copy — the new draft's id (open it to review + submit). */
export interface CopyResult {
  draftId: DraftId;
}

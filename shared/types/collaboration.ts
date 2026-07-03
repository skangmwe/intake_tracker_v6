// Comments, typed links, attachments, watchers, activity thread.

import type {
  AttachmentId,
  CommentId,
  IsoDateTime,
  ObjectType,
  RecordId,
  TypedLinkId,
  UserId,
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

export interface TypedLinkDto {
  id: TypedLinkId;
  fromRecordId: RecordId;
  toRecordId: RecordId;
  kind: TypedLinkKind;
  rationale?: string;
  createdAt: IsoDateTime;
  createdBy: UserId;
}

export interface TypedLinkCreateRequest {
  toRecordId: RecordId;
  kind: TypedLinkKind;
  rationale?: string;
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

// ── Watchers ─────────────────────────────────────────────────────────────
// Per-record subscription — never a crossing field (BS §17.3, §11.2).

export interface WatcherDto {
  recordId: RecordId;
  userId: UserId;
  subscribedAt: IsoDateTime;
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
  targetWorkspaceId: import('./common').WorkspaceId;
  includeAttachments: boolean;
  linkBackKind?: 'related' | 're-pursuit-of';
}

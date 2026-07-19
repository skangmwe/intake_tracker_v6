// Toolkit — the reference-local Toolkit item object (v2, slice 29).
// See v2-reconciliation.md §Model deltas 5 and §API deltas Toolkit, build spec §2.6/§19, and the
// S43 prototype (`AI Solutions Tracker.dc.html` — Toolkit), which is authoritative for the surface.
//
// Toolkit items are workspace-local (Object scope = Workspace). Three kinds:
// Playbook, Plugin, Prompt. Items may carry an inline markdown body OR an uploaded attachment;
// both are supported so analysts can paste short content or upload longer/binary content. The
// AI-populated one-liner is a Release 2 concern; the R1 UI exposes it as a user-editable field.
//
// Field-set note (slice 29 divergence D1): the prototype (authoritative for S43) renders Type,
// Status, Maintainer, One-liner, Description, How-to-use, Body/asset-content and an Attachment; it
// omits the §19 fields (capability tags, tech/stack, reference URLs, related-links), so those are
// not carried here. "Times used" is hidden in R1 (no usage instrumentation until R2), so there is
// no `timesUsed` field.

import type { IsoDateTime, PaginatedQuery, PaginatedResponse, ToolkitItemId, UserId, WorkspaceId } from './common';

/** The three Toolkit item kinds — the classification is fixed for R1 (extensible later). */
export type ToolkitItemKind = 'Playbook' | 'Plugin' | 'Prompt';

/**
 * Publication status shown on the S43 card/list badge. Distinct from soft-delete/retire:
 * an Archived item is still visible in the list; a retired item is hidden entirely.
 */
export type ToolkitItemStatus = 'Active' | 'Draft' | 'Archived';

/** Metadata for an item's uploaded file. Present only when the item carries an attachment. */
export interface ToolkitAttachmentInfo {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  /** Bearer-authenticated download endpoint — GET /toolkit/{id}/attachment. */
  downloadUrl: string;
}

/**
 * A single Toolkit item. `bodyMarkdown` and `attachment` are mutually usable — an item may carry
 * pasted content, an uploaded file, both, or neither.
 */
export interface ToolkitItemDto {
  id: ToolkitItemId;
  workspaceId: WorkspaceId;
  kind: ToolkitItemKind;
  status: ToolkitItemStatus;
  name: string;
  /** A scannable one-sentence summary; a primary search target and gallery/list subtitle. */
  oneLiner?: string;
  description?: string;
  /** The maintainer / who to ask — free text in R1 (no user directory yet). */
  maintainer?: string;
  /** Short guidance on how another person picks this up and applies it. */
  howTo?: string;
  /** Pasted markdown body (the asset content). Null when the item is attachment-only. */
  bodyMarkdown?: string | null;
  /** Present when the item carries an uploaded file. Null for paste-only items. */
  attachment?: ToolkitAttachmentInfo | null;
  lastModifiedAt: IsoDateTime;
  lastModifiedBy: UserId;
  createdAt: IsoDateTime;
  createdBy: UserId;
  isRetired: boolean;
  /** ETag for optimistic concurrency on PATCH. */
  eTag: string;
}

/** A single row on the S43 Toolkit list/gallery — columns follow the shared list-surface pattern. */
export interface ToolkitItemListRow {
  id: ToolkitItemId;
  kind: ToolkitItemKind;
  status: ToolkitItemStatus;
  name: string;
  oneLiner?: string;
  maintainer?: string;
  hasAttachment: boolean;
  lastModifiedAt: IsoDateTime;
  lastModifiedBy: UserId;
  eTag: string;
}

/**
 * The JSON `payload` part of the multipart create request (POST /workspaces/{id}/toolkit).
 * An optional `file` part carries the uploaded asset alongside this payload.
 */
export interface ToolkitItemCreateRequest {
  kind: ToolkitItemKind;
  /** Defaults to 'Draft' server-side when omitted (build spec §19 — Maturity defaults to Draft). */
  status?: ToolkitItemStatus;
  name: string;
  oneLiner?: string;
  description?: string;
  maintainer?: string;
  howTo?: string;
  /** Pasted asset content. Omit when the item is attachment-only. */
  bodyMarkdown?: string;
}

/**
 * The JSON `payload` part of the multipart patch request (PATCH /toolkit/{itemId}).
 * A `file` part replaces the attachment; `removeAttachment` clears it (ignored when a file is sent).
 */
export interface ToolkitItemPatchRequest {
  kind?: ToolkitItemKind;
  status?: ToolkitItemStatus;
  name?: string;
  oneLiner?: string;
  description?: string;
  maintainer?: string;
  howTo?: string;
  bodyMarkdown?: string | null;
  /** Remove the current attachment (paste-only). Ignored when a new file is uploaded. */
  removeAttachment?: boolean;
  /** ETag for optimistic concurrency — echoed as the If-Match header. */
  ifMatch?: string;
}

/** POST /workspaces/{id}/toolkit/query — the S43 list read (paginated, filtered, sorted). */
export type ToolkitQuery = PaginatedQuery;

/** The S43 list response envelope. */
export type ToolkitListResponse = PaginatedResponse<ToolkitItemListRow>;

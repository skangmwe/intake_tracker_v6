// Toolkit — the reference-local Toolkit item object (v2, slice 29).
// See v2-reconciliation.md §Model deltas 5 and §API deltas Toolkit.
//
// Toolkit items are workspace-local (Object scope = Workspace). Three kinds:
// Playbook, Plugin, Prompt. Items may carry an inline markdown body OR an uploaded
// attachment; both are supported so analysts can paste short content or upload
// longer/binary content. The AI-populated one-liner is a Release 2 concern; the
// R1 UI exposes it as a user-editable field for now.

import type {
  AttachmentId,
  IsoDateTime,
  ToolkitItemId,
  UserId,
  WorkspaceId,
} from './common';

/** The three Toolkit item kinds — the classification is fixed for R1. */
export type ToolkitItemKind = 'Playbook' | 'Plugin' | 'Prompt';

/**
 * A single Toolkit item. `bodyMarkdown` and `attachmentId` are mutually usable — an item
 * may have both (pasted content plus supporting attachment), one, or none.
 */
export interface ToolkitItemDto {
  id: ToolkitItemId;
  workspaceId: WorkspaceId;
  kind: ToolkitItemKind;
  name: string;
  description?: string;
  /** AI-populated in R2; user-editable in R1. */
  oneLiner?: string;
  /** Pasted markdown body. Null when the item is attachment-only. */
  bodyMarkdown?: string | null;
  /**
   * Uploaded attachment reference. Routes through the shared Attachments module (module 11).
   * When set, GET /toolkit/{itemId}/attachment streams the blob.
   */
  attachmentId?: AttachmentId | null;
  lastModifiedAt: IsoDateTime;
  lastModifiedBy: UserId;
  createdAt: IsoDateTime;
  createdBy: UserId;
  isRetired: boolean;
}

/** A single row on the S43 Toolkit list/gallery — columns follow the shared list-surface pattern. */
export interface ToolkitItemListRow {
  id: ToolkitItemId;
  kind: ToolkitItemKind;
  name: string;
  oneLiner?: string;
  lastModifiedAt: IsoDateTime;
  lastModifiedBy: UserId;
  hasAttachment: boolean;
}

/** POST /workspaces/{id}/toolkit — create a new item. */
export interface ToolkitItemCreateRequest {
  kind: ToolkitItemKind;
  name: string;
  description?: string;
  oneLiner?: string;
  /** Pasted markdown body. Omit when the item is attachment-only. */
  bodyMarkdown?: string;
  /** Attachment id — presumes the file was uploaded via the Attachments module first. */
  attachmentId?: AttachmentId;
}

/** PATCH /toolkit/{itemId} — sparse edit. */
export interface ToolkitItemPatchRequest {
  name?: string;
  description?: string;
  oneLiner?: string;
  bodyMarkdown?: string | null;
  attachmentId?: AttachmentId | null;
}

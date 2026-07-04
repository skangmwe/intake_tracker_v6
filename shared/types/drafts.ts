// Drafts — pre-record, personal, discardable intake state (data-model.md §Draft, BS §9.8).
// Consumed by both web/ and api/. Do not edit without updating shared-types.md.
//
// A Draft holds prefilled field values plus any related-record ids queued during the
// similar-requests nudge (slice 6). Drafts are owner-scoped and hard-deletable — the sole
// exception to the no-hard-delete floor.

import type { DraftId, IsoDateTime, ObjectType, RecordId, WorkspaceId } from './common';

/** The prefilled body of a Draft. */
export interface DraftBody {
  /** Field-value map, keyed by field key — the same shape as RequestCreateRequest.fields. */
  fields: Record<string, unknown>;
  /** Related-record ids queued during the intake similar-requests nudge (stamped on submit). */
  related?: RecordId[];
}

/** A saved Draft. */
export interface DraftDto {
  id: DraftId;
  workspaceId: WorkspaceId;
  objectType: ObjectType;
  /** A short scannable label — the request name if the user typed one. */
  title: string | null;
  body: DraftBody;
  lastEditedAt: IsoDateTime;
}

/** A row on the Drafts list (S26). */
export interface DraftListRow {
  id: DraftId;
  title: string | null;
  objectType: ObjectType;
  lastEditedAt: IsoDateTime;
}

/** POST /workspaces/{id}/drafts — create (omit id) or update (include id) a personal draft. */
export interface DraftSaveRequest {
  id?: DraftId;
  objectType: ObjectType;
  title?: string | null;
  body: DraftBody;
}

// CSV import / export (BS §13).

import type { ImportId, IsoDateTime, SavedViewId, UserId, WorkspaceId } from './common';

export type ImportStatus = 'Processing' | 'Completed' | 'CompletedWithErrors' | 'Failed';

export interface ImportStatusDto {
  id: ImportId;
  workspaceId: WorkspaceId;
  startedBy: UserId;
  startedAt: IsoDateTime;
  status: ImportStatus;
  totalRows: number;
  landedRows: number;
  /** Flagged rows — schema failures + Requestor-fallback warnings. */
  flaggedRows: ImportFlaggedRow[];
}

export interface ImportFlaggedRow {
  rowIndex: number;
  /** Multiple reasons possible per row. */
  reasons: Array<{
    code:
      | 'schema-validation'
      | 'requestor-fallback'
      | 'invalid-value'
      | 'missing-required'
      | 'unresolved-user';
    message: string;
    field?: string;
  }>;
}

export interface ExportRequest {
  savedViewId: SavedViewId;
}

/** 202 body returned by POST /workspaces/{id}/imports/csv — the client then polls GET /imports/{id}. */
export interface ImportStartResponse {
  importId: ImportId;
  status: ImportStatus;
}

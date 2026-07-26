// CSV import / export (BS §13).

import type {
  ImportId,
  IsoDateTime,
  SavedViewId,
  UserId,
  WorkspaceId,
} from "./common";

export type ImportStatus =
  "Processing" | "Completed" | "CompletedWithErrors" | "Failed";

export interface ImportStatusDto {
  id: ImportId;
  workspaceId: WorkspaceId;
  startedBy: UserId;
  startedAt: IsoDateTime;
  status: ImportStatus;
  totalRows: number;
  landedRows: number;
  createdRows: number;
  updatedRows: number;
  /** Flagged rows — schema failures + Requestor-fallback warnings. */
  flaggedRows: ImportFlaggedRow[];
}

export interface ImportFlaggedRow {
  rowIndex: number;
  /** Multiple reasons possible per row. */
  reasons: Array<{
    code:
      | "schema-validation"
      | "requestor-fallback"
      | "invalid-value"
      | "missing-required"
      | "unresolved-user"
      | "invalid-id"
      | "record-not-found";
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

// ─── Object-aware import/export (S28 tabs + wizards) ───────────────────────────

/**
 * One field an object exposes to import (a CSV column may map to it) or export (it can be emitted as
 * a column). `required` marks an import field that must be mapped; `alwaysIncluded` marks an export
 * field that is always in the file (the identity column) and cannot be unchecked.
 */
export interface IoFieldSpec {
  key: string;
  label: string;
  required?: boolean;
  alwaysIncluded?: boolean;
}

/** An importable/exportable object type and the fields it supports on each side (registry metadata). */
export interface IoObjectDto {
  /** Machine key — matches the object type union ('Request', 'Task', …). */
  objectType: string;
  /** Plural display label ('Requests'). */
  label: string;
  canImport: boolean;
  canExport: boolean;
  canUpsert: boolean;
  importFields: IoFieldSpec[];
  exportFields: IoFieldSpec[];
}

/** One CSV-column → object-field mapping used by the import wizard. */
export interface ImportColumnMapping {
  columnIndex: number;
  fieldKey: string;
}

/** POST /workspaces/{id}/exports/object body — object + the chosen field columns. */
export interface ObjectExportRequest {
  objectType: string;
  fieldKeys: string[];
}

export type ImportMode = "create" | "upsert";

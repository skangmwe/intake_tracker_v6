# fix-surface-fields-task-d8eeeb6 — code-review findings

**Scope:** database (`usp_GetTasksForWorkspace` + tSQLt) + api (`TaskIoObject` onto the manifest,
`WorkspaceTaskExportRow` entity, `TaskIoObjectTests`).
**Checklists:** database-backend.md, api-middletier.md.

## Iteration 1 — 0 findings

- **`usp_GetTasksForWorkspace`**: `SET NOCOUNT/XACT_ABORT ON`, `CREATE OR ALTER`, schema-qualified,
  explicit columns (no `SELECT *`), parameterized, params copied to locals, `OFFSET/FETCH` pagination.
  The new creator join mirrors the shipped Attachment export proc — `LEFT JOIN dbo.Users ON UserId =
  TRY_CAST(t.CreatedBy AS UNIQUEIDENTIFIER)` — matching types, so a seeded / non-GUID actor resolves to
  a null name instead of failing the read. The typed-field value is coalesced to one text cell
  (`CK_Tasks_OneFieldValue` guarantees at most one value column is set). Read-only SELECT → no TRY/CATCH
  transaction needed, consistent with the existing proc. Driving filter is `WorkspaceId`/`IsDeleted`,
  covered by the filtered `IX_Tasks_Record_Workspace` (SARGable). No finding.
- **`TaskIoObject`**: converted from the hardcoded `IoFieldSpec` + `ProjectRow` pair to the Approach-B
  manifest (`ObjectFieldSpec<WorkspaceTaskExportRow>` → `ManifestSupport.ExportFieldsFrom` / `.Project`),
  matching the shipped `AttachmentIoObject` exactly (paging at the pagination max, `MaxExportRows` cap,
  `CancellationToken` threaded, `ConfigureAwait(false)` via the service). `CatalogFields` stays empty by
  design — Task's catalog is already sourced from stored FieldDefinition rows (migration 075 Global
  attributes + the task-field library) plus the synthesised system auto-fields, so synthesising manifest
  rows here would duplicate them. Documented in the class header. No finding.
- **`WorkspaceTaskExportRow`**: four additive columns (`CreatedAt`, `CreatedByName`, `FieldLabel`,
  `FieldValue`); nullable reference types used correctly (`string?`), no `!` suppression. No finding.

**End-of-iteration open set:** empty.

## Final Status: CLEAN

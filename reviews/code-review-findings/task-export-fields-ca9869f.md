# task-export-fields-ca9869f — code-review findings

**Scope:** database (migration 075, usp_GetTasksForWorkspace + tSQLt) + api (TaskIoObject, TasksService.QueryWorkspaceTasksAsync, WorkspaceTaskExportRow entity + registration, Program.cs).
**Checklists:** database-backend.md, api-middletier.md.

## Iteration 1 — 0 findings

Walked both checklists against every changed file.

- `usp_GetTasksForWorkspace.sql` — `SET NOCOUNT/XACT_ABORT ON`, `CREATE OR ALTER`, schema-qualified, explicit column list (no `SELECT *`), fully parameterized, `OFFSET/FETCH` pagination, params copied to locals, matching-type joins, header comment. Not an access-gate proc by design — the authoritative Viewer check is upstream in `ExportService.ExportObjectAsync` (documented in the header). No finding.
- `20260723_075_SeedTaskPlatformFields.sql` (+ rollback) — idempotent `NOT EXISTS` guard backed by `UX_FieldDefinition_Global_Object_Key`; single logical change (data-only); transaction + `MigrationHistory`; matching idempotent rollback. No finding.
- `TaskIoObject.cs` — mirrors `FeatureIoObject` (export-only), `CancellationToken` threaded, `ConfigureAwait(false)`, row-cap trim, projection keyed to the export field specs. No finding.
- `TasksService.QueryWorkspaceTasksAsync` — `FromSqlRaw` + `SqlParameter` only, async + `CancellationToken`, `Async` suffix. No finding.
- `WorkspaceTaskExportRow` entity + `AppDbContext` `HasNoKey().ToView(null)` registration + `Program.cs` `AddScoped` — additive, mirror existing patterns. No finding.

**End-of-iteration open set:** empty.

## Final Status: CLEAN

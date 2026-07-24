# fix-request-dynamic-export-061b2a1 — code-review findings

**Scope:** database (`usp_GetRequestsForWorkspace` + tSQLt) + api (workspace-aware `IIoObject`
export contract, `RequestIoObject` dynamic export, `IRequestsService` reads, `ExportService`,
`ImportExportController`, `WorkspaceRequestExportRow` entity, `RequestExportField` DTO, 7 test files).
**Checklists:** database-backend.md, api-middletier.md.

## Iteration 1 — 0 findings

- **Contract change** (`IIoObject.ExportFields` property → `GetExportFieldsAsync(workspaceId, userId,
  ct)`): the workspace-aware export field set is the design the developer explicitly approved
  (AskUserQuestion, 2026-07-24 — "fully dynamic per-workspace"), so api/CLAUDE.md's "no abstractions
  without discussion" is satisfied. Mechanical, uniform update across all five descriptors: the four
  fixed-column descriptors wrap their static list in `Task.FromResult`; `RequestIoObject` derives its
  columns from the workspace catalog. No finding.
- **`RequestIoObject`**: `CancellationToken` threaded through every call, `ConfigureAwait(false)`,
  `MaxExportRows` cap + `OFFSET/FETCH` paging (no N+1 — the FieldValues arrive in the bulk read, the
  projection is an in-memory JSON parse). `JsonDocument` is disposed via `using`; values are
  materialised (string / long / double / joined / Yes-No) before disposal, so no `JsonElement`
  outlives its document. Numbers preserve int64 (the ternary casts the integer branch to `object` so
  both branches are not widened to `double` — precision-safe). Import path unchanged. No finding.
- **`RequestsService` reads**: `FromSqlRaw` + `SqlParameter` only, `ct` threaded, `ConfigureAwait`.
  `GetRequestExportFieldsAsync` reads the SAME catalog proc as the Fields tab and filters non-retired
  Request rows in memory (so the picker cannot drift from the catalog). No cycle: `RequestsService`
  reads the catalog via its own `_db`, not via `FieldSchemaService` (which depends on the IIoObject
  registry). No finding.
- **`usp_GetRequestsForWorkspace`**: `SET NOCOUNT/XACT_ABORT ON`, `CREATE OR ALTER`, schema-qualified,
  explicit columns, parameterized, params copied to locals, `OFFSET/FETCH`, `IsDeleted = 0` filter.
  Same workspace-scoped read pattern (and index support) as the existing Request list read. Read-only
  → no TRY/CATCH transaction. Not an access-gate proc by design — the Viewer gate is upstream in
  ExportService. No finding.
- **`ExportService` / `ImportExportController`**: resolve export fields per workspace + caller before
  validating the requested subset / shaping the DTO; `ct` threaded. The `io/objects` loop awaits each
  descriptor, but only Request touches the DB (the others return a completed task). No finding.
- **Note (not a finding):** `BuildExportAsync` re-reads the catalog that `ExportService` already read
  for validation (two catalog reads per export). Export is a user-initiated download, not a hot path;
  the two-method `IIoObject` contract is shared across all descriptors, so passing the columns through
  would leak Request-specific shape into the interface. Documented in-code; acceptable.

**End-of-iteration open set:** empty.

## Final Status: CLEAN

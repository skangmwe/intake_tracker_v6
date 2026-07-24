# surface-fields-attachment-toolkit-605f794 — code-review findings

**Scope:** database (usp_GetAttachmentsForWorkspace, usp_GetToolkitForWorkspace + tSQLt) + api
(manifest foundation, AttachmentIoObject, ToolkitIoObject, service methods, FieldSchemaService
catalog wiring, IIoObject.CatalogFields, keyless entities, Program.cs).
**Checklists:** database-backend.md, api-middletier.md.

## Iteration 1 — 0 findings

- **Manifest abstraction** (`Shared/Schema/ObjectFieldSpec.cs`, `ManifestSupport`, `IIoObject.CatalogFields`):
  this is the Approach-B design the developer explicitly approved (single source per object; catalog +
  export derive from one list). api/CLAUDE.md's "no abstractions without discussion" is satisfied — the
  discussion + sign-off happened before the build. Types live in a neutral `Shared.Schema` namespace so
  no module cycle exists.
- **`FieldSchemaService` → `IIoObjectRegistry`**: deliberate, so the workspace catalog surfaces the same
  built-in fields the descriptors export (single source). Acyclic (the descriptors do not depend on the
  field service). Additive: `BuildCatalogRows` keeps a 1-arg overload, so all pre-existing pure-function
  tests are unchanged.
- **Procs**: `SET NOCOUNT/XACT_ABORT ON`, `CREATE OR ALTER`, schema-qualified, explicit columns,
  parameterized, params copied to locals, `OFFSET/FETCH` pagination, matching-type joins (`TRY_CAST` of
  the audit actor id → `dbo.Users`), header comments. Not access-gate procs by design — the authoritative
  Viewer check is upstream in `ExportService`. No finding.
- **C#**: `CancellationToken` threaded, `ConfigureAwait(false)`, `FromSqlRaw`+`SqlParameter` only, `Async`
  suffix, keyless entities registered `HasNoKey().ToView(null)`, descriptors mirror the existing
  Feature/Task export pattern (paging, row cap). No finding.

**End-of-iteration open set:** empty.

## Final Status: CLEAN

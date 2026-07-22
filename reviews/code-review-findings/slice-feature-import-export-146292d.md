# slice-feature-import-export — code-review findings

## Iteration 1

Scope (changed source):
- `api/Api/Modules/ImportExport/IoObjectRegistry.cs` — added `IIoImporter`, `ImportRowContext`,
  `ImportRowResult`; `BuildExportAsync` gains `userId` and returns nullable (object-owned access boundary).
- `api/Api/Modules/ImportExport/CsvRowMapper.cs` — extracted object-agnostic `MapValues` / `AutoMatchValues`
  / `BuildRequestCreate`; `Map` / `MapFromMapping` now delegate (public API unchanged, tests green).
- `api/Api/Modules/ImportExport/RequestIoObject.cs` — implements `IIoImporter` (requestor SSO resolution
  moved here from the runner); gains `AppDbContext`; new export signature.
- `api/Api/Modules/ImportExport/FeatureIoObject.cs` — new Feature descriptor (export + import).
- `api/Api/Modules/ImportExport/ImportRunner.cs` — generic registry dispatch (no longer Request-hardcoded);
  drops `IRequestsService`, adds `IIoObjectRegistry`.
- `api/Api/Modules/ImportExport/ExportService.cs` — maps a null dataset to `Denied`.
- `api/Api/Program.cs` — registers `FeatureIoObject` as a second `IIoObject`.

Checklist applied: `api-middletier.md` (basic + advanced).

Findings: **none.**

Verified against the checklist:
- Naming: `FeatureIoObject`, `IIoImporter`, `ImportRowContext/Result` PascalCase; interface `I`-prefixed;
  async methods end in `Async`; no single-letter identifiers (`index`, `rowIndex`, `column`, `page`).
- Async discipline: every method accepts and forwards `CancellationToken`; `ConfigureAwait(false)` on all
  awaits in the service/descriptor library code.
- Config via `IOptions<ImportExportOptions>` — no raw `IConfiguration`, no invented limits (page size,
  MaxExportRows, MaxFileBytes all from existing options / api pagination max).
- Control flow: outcomes via result records (`ImportRowResult`, `ExportResult`), not exceptions; the runner's
  per-row `catch … when (not OperationCanceledException)` flags-and-continues (cancellation still propagates).
- Registry is the single import/export extension point — Slice 2 adds one descriptor + one DI line, no new
  endpoint and no per-object branch in the runner.
- Simplicity/surgical: the export-signature + import-dispatch changes are the minimum needed to make the
  runner object-agnostic (the stated architecture); every changed line traces to "add Feature".

Auto-applied mechanical fixes: none required.
Architectural findings: none.

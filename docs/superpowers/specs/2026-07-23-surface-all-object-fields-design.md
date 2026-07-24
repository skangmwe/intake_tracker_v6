# Surface every object field in the catalog + export (manifest architecture)

**Date:** 2026-07-23
**Status:** Approved (Approach B). Multi-slice program.

## Goal

Maximum front-end flexibility: **every field that exists in the build is surfaced in both the
Fields & objects catalog and the Import/Export field picker**, for all five objects (Request,
Task, Feature, Attachment, Toolkit item). Backend-only — the web Fields tab and Export wizard are
already data-driven off the API.

## Approach B — one field manifest per object

A single per-object field list drives both surfaces, so the two can't drift ("if a field exists,
it's surfaced everywhere"). Two object shapes:

- **Fixed-column objects** (Task, Attachment, Toolkit item): each field maps to a column. The
  manifest is code-defined (`ObjectFieldSpec<TRow>`), and the catalog synthesizes built-in rows
  from it.
- **Dynamic `FieldValues` objects** (Request, Feature): fields come from stored `FieldDefinition`
  rows; export derives its columns from those and reads values from the `FieldValues` JSON map.

### Foundation types (`api/Api/Shared/Schema/ObjectFieldSpec.cs`)

```csharp
public sealed record ObjectFieldSpec<TRow>(
    string Key, string Label, string FieldType, Func<TRow, object?> Read, bool IsIdentity = false);
public sealed record CatalogFieldSpec(string ObjectType, string Key, string Label, string FieldType);
```

`IIoObject` gains `IReadOnlyList<CatalogFieldSpec> CatalogFields` — the descriptor is the single
source of an object's field set. Descriptors whose catalog comes from `FieldDefinition` rows
(Request/Feature/Task) return empty. `FieldSchemaService.GetCatalogAsync` reads
`IIoObjectRegistry`, gathers each descriptor's `CatalogFields`, and synthesizes read-only built-in
catalog rows (deduped against the System auto-fields and stored rows). `BuildCatalogRows` keeps a
1-arg overload so existing pure-function tests are unchanged.

## Slice plan

- **Slice 1 (this):** foundation + **Attachment** + **Toolkit item**. Both are fixed-column and
  have *zero* today in either surface. New workspace export queries
  (`usp_GetAttachmentsForWorkspace`, `usp_GetToolkitForWorkspace`) returning all user-meaningful
  columns; manifests; `AttachmentIoObject` / `ToolkitIoObject` (export-only); catalog built-in
  rows; registrations. Access is the upstream `ExportService` Viewer gate (workspace-scoped —
  never widens access, BS §22.4).
- **Slice 2:** Task onto the manifest — complete its export (Created date/by + the captured
  typed-field value) and surface its fixed columns as built-in catalog rows.
- **Slice 3:** Request + Feature — derive export columns from each object's field catalog, read
  values from `FieldValues`; seed Feature's field schema (it has none today). **Split into two ships
  (user-approved 2026-07-24):**
  - **Slice 3a (shipped):** the workspace-aware export contract + **Request** dynamic export.
    `IIoObject.ExportFields` (static property) became `GetExportFieldsAsync(workspaceId, userId, ct)`
    — the four fixed-column descriptors wrap their static list; `RequestIoObject` derives its columns
    from the workspace field catalog (`GetRequestExportFieldsAsync` → `usp_GetWorkspaceFieldCatalog`,
    the SAME read as the Fields tab, so the export picker cannot drift) and projects each request's
    `FieldValues` JSON map (`usp_GetRequestsForWorkspace`) into an export row. Request export went from
    9 static columns to identity + every non-retired Request field (~46). `ExportService` and the
    `io/objects` endpoint resolve export fields per workspace + caller.
  - **Slice 3b (pending):** **Feature** — seed a Feature `FieldDefinition` schema (zero rows today),
    then make `FeatureIoObject` derive its export columns from the (hub-scoped) catalog + `FieldValues`,
    reusing the now-workspace-aware `GetExportFieldsAsync` contract.

**Value-formatting rule (fixed in 3a):** a JSON number is materialised as `long` when it fits int64,
else `double` — never coerced to `double` unconditionally (which would lose int64 precision). Booleans
export as `Yes`/`No`; arrays join with `"; "`; nested objects as raw JSON; null/absent as an empty cell.
`CsvExportWriter.WriteDataset` already tolerates ragged rows (a column absent from a request's map → an
empty cell), so a superset column list over sparse per-record dicts needs no writer change.

## Boundary

Surface **user-meaningful** fields only. Exclude internal plumbing: blob paths, `WorkspaceId`,
`RowVer`, soft-delete columns, raw assignee/owner GUIDs (resolved to display names instead).

## Fields surfaced this slice

**Attachment:** File name (identity), Parent record, Parent type, Content type, Size, Kind
(File/Link), External URL, Uploaded date, Uploaded by.
**Toolkit item:** Name (identity), Kind, Status, One-liner, Description, Maintainer, How to use,
Body, Has attachment, Attachment file name, Last updated, Updated by.

## Tests

- tSQLt: `usp_GetAttachmentsForWorkspace`, `usp_GetToolkitForWorkspace` (workspace scope,
  soft-delete exclusion, assignee/uploader join, pagination).
- xUnit: `AttachmentIoObject` / `ToolkitIoObject` (metadata, projection, paging, cancellation),
  and `FieldCatalogBuilderTests` extended for built-in-field synthesis.

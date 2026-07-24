# fix-feature-dynamic-export-9238f7f — security-review findings

**Scope:** database + api (Feature dynamic export + Feature field-schema seed).
**Checklists:** database-backend-security.md, api-middletier-security.md (OWASP A01–A10).

## Iteration 1 — 0 findings

- **A01 Broken Access Control** — the access model is unchanged. `FeatureIoObject.BuildExportAsync`
  reads through `IFeaturesService.QueryFeatureExportAsync`, which resolves the AI Solutions hub and
  gates `HasWorkspaceLevelAsync(userId, hubId, Viewer)` — a non-member gets `null` → 403, never a
  silent empty file (BS §22.4). Same gate as the existing `QueryAsync`. `usp_GetFeaturesForWorkspace`
  filters `WHERE WorkspaceId = @Ws` (the hub). Surfacing every Feature field to a hub Viewer exposes
  nothing new — a hub member can already read the whole `FieldValues` map per-record.
  `GetFeatureExportFieldsAsync` (the field-picker labels) is not membership-gated, but it returns only
  non-sensitive config (field keys/labels), and the `io/objects` endpoint is already Viewer-gated on
  the passed workspace — documented on the interface.
- **A03 Injection** — the export proc and both service reads are fully parameterized (`SqlParameter`
  via `FromSqlRaw`); the seed migration uses a table variable + `INSERT…SELECT`, no dynamic SQL.
  `FieldValues` is parsed with `JsonDocument` (safe structured parse), never string-built into SQL.
- **A02 / logging** — no log statements added. Feature `FieldValues` (one-liner, what-it-does,
  owner, …) is Confidential; none is logged — it travels only in the authorized export CSV response.
  The existing `CsvExportWriter` formula-injection guard still applies to every cell.
- **Data exposure** — only `RecordId` + the field-catalog columns are emitted; `WorkspaceId`,
  `RowVer`, `OwnerUserId`, and soft-delete columns are not projected. A key present in `FieldValues`
  but absent from the catalog is dropped.
- No secrets, no new config, no new external calls. The seed contains no PII (synthetic field metadata).

**End-of-iteration open set:** empty.

## Final Status: CLEAN

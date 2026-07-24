# fix-request-dynamic-export-061b2a1 — security-review findings

**Scope:** database + api (Request dynamic export + workspace-aware export contract).
**Checklists:** database-backend-security.md, api-middletier-security.md (OWASP A01–A10).

## Iteration 1 — 0 findings

- **A01 Broken Access Control** — the access model is unchanged. `ExportService.ExportObjectAsync`
  gates `HasWorkspaceLevelAsync(userId, workspaceId, Viewer)` before resolving fields or building the
  export; `usp_GetRequestsForWorkspace` filters `WHERE WorkspaceId = @Ws`. This is the same
  workspace-scoped read the prior Request export used (`RequestsService.QueryAsync` is workspace-scoped,
  not user-filtered), so no widening (BS §22.4). Surfacing every Request field to a Viewer exposes
  nothing new: a workspace member can already read the whole `FieldValues` map per-record via
  `usp_GetRequestByIdForUser`. The `io/objects` catalog endpoint is Viewer-gated in the controller;
  the field catalog is non-sensitive config (keys/labels).
- **A03 Injection** — the export proc and both service reads are fully parameterized (`SqlParameter`
  via `FromSqlRaw`); no string concatenation/interpolation into SQL. `FieldValues` is parsed with
  `JsonDocument` (safe structured parse), never string-built into SQL.
- **A02 / logging** — no log statements added. Request field values (`FieldValues`), requestor emails,
  and business-owner names are Confidential/PII; none are logged — they travel only in the authorized
  export CSV response. The existing `CsvExportWriter` formula-injection guard (`= + @ \t \r`) still
  applies to every cell.
- **Data exposure** — no internal plumbing surfaced: only `RecordId` + the field-catalog columns are
  emitted. `WorkspaceId`, `RowVer`, and soft-delete columns are not projected; a key present in
  `FieldValues` but absent from the catalog is not a column and is dropped.
- No secrets, no new config, no new external calls.

**End-of-iteration open set:** empty.

## Final Status: CLEAN

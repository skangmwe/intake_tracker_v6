# ImportExport

Owns CSV import (create-only) and export current view (BS §13, S28; module-boundaries.md §18).
Depends on: Requests, Fields, Prefix Registry (via `usp_MintRecordId`), Users (Requestor SSO
resolution), Saved Views (export reads the view). Never updates a live record.

## Import (WorkspaceAdmin only)

`POST /workspaces/{id}/imports/csv` streams the CSV to Blob (`LocalBlobStreamer` in dev), records the
job via the admin-gated `usp_CreateImport`, enqueues it, and returns `202 { importId }`. Processing
runs **in-process**, off the request thread: `ImportProcessor` (a hosted `BackgroundService`) drains
`ImportQueue` and runs `ImportRunner` per job in its own DI scope. The dev/test stack has no Service
Bus, so this is the in-process stand-in for the Worker/Service-Bus processor named in
module-boundaries §18 — the same precedent as slice 12's in-process notification fan-out.

`ImportRunner` parses the CSV (CsvHelper), maps each row (`CsvRowMapper`), resolves the Requestor
against the firm directory (SSO email → `Users`), falling back to the importing admin **with a flag**
(never silent, BS §13), and creates each Request through the shared `IRequestsService.CreateAsync`
(shared ID counter via `usp_MintRecordId`, BS §6.7). Per-row outcomes go to `usp_RecordImportRow`; the
job is stamped terminal by `usp_CompleteImport`. `request.created` fans no notification for a
brand-new record (no watchers), so "no per-record notifications during import" holds.

`GET /imports/{id}` polls the status + the per-row report (admin-gated; 403, never 404).

## Export

`POST /exports` runs `ExportService` (no DbContext — composes SavedViews + the access-gated Requests
query + AccessGuard, fully unit-testable). Columns follow the saved view; rows follow the caller's
entitlements (Viewer+ of the view's workspace — export never widens access, BS §22.4). R1 exports
Request-object views only (the S2 Export-view button); other object types return 400. CSV is written by
the pure `CsvExportWriter` (RFC-4180 escaping) with a UTF-8 BOM for spreadsheet apps.

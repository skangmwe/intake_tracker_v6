---
slice: 16-import-export
capability: A workspace admin imports a CSV to create records (with a per-row validation report) and exports a saved view as CSV.
spec-section: BS §13, S28
started: 2026-07-05T23:23:34-04:00
ended: 2026-07-06T00:08:06-04:00
duration: 00:44:32
---

# Slice 16 — CSV Import & Export

Create-only CSV import with a per-row validation report, plus Export-view (CSV) wired to S28 and the
S2 Requests-list Export button. Decisions worth carrying forward:

## Processing mechanism — in-process, not Service Bus (analyst-approved)

The plan/module-boundaries named a "Worker-hosted import processor" over Service Bus. The dev/test
stack has no Service Bus (documented no-op), so — following the slice-9 (derived mirror), slice-11
(config-selected blob), and slice-12 (in-process notification fan-out) precedent — processing runs
**in-process**: the upload streams the CSV to Blob (`LocalBlobStreamer` in dev), records the job
(`usp_CreateImport`), enqueues an `ImportJobMessage` on an unbounded in-process `Channel`
(`ImportQueue`, Singleton), and returns `202`. `ImportProcessor` (a hosted `BackgroundService`) drains
the queue **off the request thread** (honouring api-performance's "no long work inline") and runs
`ImportRunner` per job in its own DI scope. The Worker/Service-Bus path stays the documented production
mechanism but is not wired in R1. The `api/Worker` project keeps its scaffold no-op.

## New dependency — CsvHelper 33.1.0 (analyst-approved)

CSV parsing has real RFC-4180 edge cases (quoted fields, embedded commas/newlines, doubled-quote
escaping). Added `CsvHelper` (MIT, latest stable verified live on NuGet, no known high/critical
advisories) rather than hand-rolling a parser. Export CSV is written by the pure `CsvExportWriter` (we
own the escaping there — trivial and unit-tested).

## Reuse over duplication

- Import creates each row through the shared `IRequestsService.CreateAsync` — same mint (`usp_MintRecordId`,
  shared counter per BS §6.7), lifecycle resolution, and validation as in-app creation. `request.created`
  fans **zero** notifications for a brand-new record (no watchers yet), so "no per-record notifications
  during import" (BS §13) holds without special-casing. Validation errors map to typed row reasons
  (`ImportOutcomeMapper`); the pure `CsvRowMapper` handles header aliasing.
- **Requestor resolution** (BS §13): a row's Requestor value is resolved against `dbo.Users` by email
  (SSO). Resolved → kept; provided-but-unresolved → falls back to the importing admin **and flags the
  row** (`unresolved-user` + `requestor-fallback` — never silent); absent → nothing to resolve.
- **Export** composes `ISavedViewsService` + the access-gated `IRequestsService.QueryAsync` + `IAccessGuard`
  — it has **no DbContext**, so it is fully unit-testable (like `CopyService`). Columns follow the view;
  rows follow the caller's entitlements (Viewer+ of the view's workspace is the row entitlement for
  Requests — export never widens access, BS §22.4). Added `ISavedViewsService.GetByIdAsync` (ungated
  read of the definition; export applies its own access gate).

## Scope calls

- **Export is Request-object-only in R1** — the S2 Export button (this slice's stated deliverable). A
  Feature/other-object view returns `400 Unsupported`; S9/S22 export wiring is a later slice ("Export
  view buttons on S2 (and later S9, S22)" per the plan).
- **S2 Export button** exports the active **saved view**; a built-in preset (All / Unassigned / …) has
  no stored id, so the button is disabled with a "Save this view to export it" tooltip until a real view
  is active (the API keys on a `savedViewId`).
- **Access gate:** import + status + export are WorkspaceAdmin-gated in the procs/services; a
  forbidden/non-existent import is `403`, never `404` (BS §22.6). Export unknown-view is `404` (a view
  is not access-hidden like a record).

## Contract additions

- `shared/types/imports.ts` — added `ImportStartResponse { importId, status }` (the 202 body).
- `apiClient` — added `apiFetchBlobPost` (POST + read a Blob, bearer-authenticated) for the CSV download;
  `shared/http/download.ts` — added `saveBlob` (transient `<a download>`), shared for the export (and
  any future authenticated download).

## Known-pre-existing (not introduced here)

`tsc --noEmit` reports 13 errors in **pre-existing** test files (`attachments/api.test.ts`,
`gates/gateView.test.ts`, `BellMenu.test.tsx`) — the same ones slice 15 documented as out-of-scope
cleanup. Slice 16 adds **zero** new tsc errors; left untouched per surgical-scope discipline.

---
slice: 15-search
capability: The top-bar workspace search returns up to 6 records; a full Search Results surface (S27) shows access-respecting hits across fields, comments, and attachment filenames — with snippets and match-kind.
spec-section: BS §9.5 (search — access-respecting, no OCR, Legacy ID searchable); api-contracts §14; module-boundaries §17
started: 2026-07-05T21:32:19-04:00
ended: 2026-07-05T22:22:54-04:00
duration: 00:50:35
---

# Slice 15 — Search

Ships the S27 full-search surface + the real top-bar workspace search (replacing the slice-2 stub).
Four decisions are worth recording; the rest is carried by the diff.

## Decision 1 — LIKE-based token overlap, not SQL Server full-text (divergence, approved)

The slice plan named a **SQL Server full-text index refreshed via triggers (or scheduled ETL)**. The
dev/test stack is **LocalDB, which ships no Full-Text component** — `CREATE FULLTEXT CATALOG` errors,
so the plan-as-written would fail the real-stack validation gate. This is the exact wall slice 6 hit;
it explicitly deferred the access-respecting full-text Search surface here and noted "slice 15's own
plan already defers the index mechanism." **Approved at plan-confirmation:** both procs match with a
**LIKE-based token overlap** (tokens ≥ 3 chars, LIKE-metacharacters escaped, scored by overlap),
workspace-scoped and access-gated by the same `WorkspaceMembership` join every record read uses —
portable to every SQL Server edition and adequate at the 500-user ceiling. `usp_SearchRecords`
(records-only, top 6) matches Name / Description / RecordId / Legacy ID; `usp_SearchFull` (S27) UNIONs
three sources — Request fields, Comment bodies, Attachment filenames — grouped by record. No OCR
(filenames only). Legacy ID lives in `Requests.FieldValues.$.legacyId` (populated by CSV import, slice
16); searchable now.

## Decision 2 — access returns empty, never 403

Unlike the record-detail reads (which 403 an inaccessible record), search **returns an empty result**
for a non-member (or a query matching nothing visible) rather than a `403`. A `403` would itself
disclose that the workspace exists / that the caller lacks access; "surface only what the viewer can
see" (BS §9.5 / §22.6) is served faithfully by an empty set. The access gate is **inside the procs**;
the controller adds no `403`. Every authenticated caller may search — the results are the boundary.

## Decision 3 — raw ADO.NET reads, no new DbContext entities

Both procs are read through raw ADO.NET on the context connection (mirroring `usp_QueryRequests`),
not `FromSqlRaw` — `usp_SearchFull` returns **two result sets** (page rows + total count) which
`FromSqlRaw` cannot bind, and the raw reader keeps the module self-contained (no keyless-entity
registrations added to the shared `AppDbContext`). `SearchService` references `PaginatedResponse<T>`
from the Requests module (the shared paginated envelope, as Features / Notifications do).

## Decision 4 — `resolveActiveWorkspaceId` extracted to shared

Search became the **third** consumer of `resolveActiveWorkspaceId` (after Requests and Feature
Catalog), so it moved to `web/src/shared/workspace/activeWorkspace.ts` (web-file-structure.md — utils
used by 2+ features live in shared/). `features/requests/workspace.ts` is now a one-line re-export, so
existing requests-feature imports are untouched; the test moved with the impl. A new
`shared/hooks/useDebouncedValue.ts` backs the top-bar typeahead debounce; `IntakeForm`'s pre-existing
inline debounce was left as-is (out of scope).

## Contract additions (living docs updated)

- `api-contracts.md` §14 — access model + LIKE mechanism + GET match fields + `pageSize>100 → 400` noted.
- `shared-inventory.md` — slice-15 section (shared util, hook, constants, module, procs).
- Shared types **reused unchanged**: `SearchHitDto` / `SearchResultDto` (already in `notifications.ts`).

## Pre-existing issue surfaced (not fixed — out of scope)

Running `npm run type-check` (`tsc --noEmit`, which `include`s test files) reports **13 pre-existing
type errors** in slice 6/8/11/12 test files (`attachments/api.test.ts`, `gates/gateView.test.ts`,
`BellMenu.test.tsx`) under `exactOptionalPropertyTypes: true`. None are in slice-15 files (verified).
They do not gate this workflow — `type-check` runs only on PRs (via `ci.yml`), and the ship flow merges
directly to `dev` without PRs; the enforced web gates are lint + jest + e2e + reviews. Flagged per the
surgical-changes rule; left for a dedicated cleanup.

## Out of scope (deferred)

CSV import populating Legacy IDs (slice 16 — searchable path is in place now); advanced result
grouping across page boundaries (a record's hits can split across pages — acceptable per the plan);
gallery/other advanced surfaces (slice 24).

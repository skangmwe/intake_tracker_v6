# Search

Workspace search across records, comment bodies, and attachment filenames (module-boundaries.md §17,
api-contracts.md §14). Owns no state — reads Requests / Comments / Attachments through access-gated
stored procedures.

- `SearchController` — `GET /api/v1/search?q=&workspaceId=` (records-only, ≤6 hits) and
  `POST /api/v1/search/full` (S27 — paginated hits across all three sources).
- `SearchService` — calls `usp_SearchRecords` / `usp_SearchFull` via raw ADO.NET (the full read
  returns two result sets: page rows + total count).
- Access is inside the procs (a `WorkspaceMembership` gate): a non-member gets an empty result, never
  a 403 — search never discloses existence (BS §9.5 / §22.6).

**Matching is LIKE-based token overlap, not SQL Server full-text** — the dev/test stack is LocalDB
(no Full-Text component). Same resolution as slice 6's similar-requests nudge, approved at the slice-15
plan-confirmation. No OCR: attachments match on filename only. Legacy ID (in `Requests.FieldValues`)
is searchable per BS §9.5.

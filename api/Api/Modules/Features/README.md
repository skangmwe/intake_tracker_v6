# Features

Owns Feature Catalog records (AI Solutions workspace only — the reporting hub). Depends on: Requests
(Add-to-catalog reads a source Request), Drafts (the prefill mechanism), Typed Links (the
`sourced-from` stamp + detail read). See module-boundaries.md § 8.

Built in slice 14. Surface:

- `POST /api/v1/features/query` — the catalog list (S9), AI-workspace Viewer+. `GET /features/{id}` —
  detail (S10). `POST /features` — create (Member+). `PATCH /features/{id}` — edit (ETag). `POST
  /features/{id}/publish` · `/deprecate` — Maturity change, no gate (BS §18.5).
- `POST /api/v1/requests/{id}/add-to-catalog` — prefills a `Feature` draft from a shipped Request by
  same-field-identity + queues a `sourced-from` link; the link is stamped from the new feature at
  submission via `usp_CreateFeature @QueuedLinksJson` (the same prefill-plus-link pattern as Copy).

The AI Solutions workspace is resolved server-side by `Kind = 'ai-solutions'` (no workspace in the
path). Content-field values live in a `FieldValues` JSON map; `Name` / `Maturity` are promoted
columns. Firm-wide read-only access to Published features (Dashboard-viewer, BS §10.4) is slice 23.

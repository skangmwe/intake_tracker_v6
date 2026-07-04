# Requests & Drafts (Slice 5)

The primary record surface — create, list, detail, edit, stage move, hold — plus owner-scoped
drafts. Depends on: Fields, Lifecycle, Platform, Event Spine (module-boundaries.md §4). All CRUD
runs through the `database/procedures/requests/` stored procs (mint + origin resolution,
optimistic-concurrency PATCH, multi-filter list); the API never tracks `Requests` / `Drafts` as EF
entities, only keyless projections bound via `FromSqlRaw` (and raw ADO.NET for the two-result-set
list read in `usp_QueryRequests`).

## Endpoint → proc → event map

| Endpoint | Access | Proc | Event |
|---|---|---|---|
| `POST /workspaces/{id}/requests` | Member+ | `usp_GetWorkspaceLifecycles` + `usp_GetWorkspaceStages` (lifecycle resolve) → `usp_CreateRequest` | `request.created` |
| `POST /workspaces/{id}/requests/query` | Viewer+ | `usp_QueryRequests` (2 result sets) | — |
| `GET /requests/{recordId}` | baked (membership) | `usp_GetRequestByIdForUser` | — |
| `PATCH /requests/{recordId}` | Member+ | `usp_PatchRequest` | `request.updated` |
| `POST /requests/{recordId}/stage` | Member+ | `usp_SetRequestStage` | `request.stage-changed` |
| `POST /requests/{recordId}/hold` | Member+ | `usp_SetRequestHold` | `request.hold-changed` |
| `POST /workspaces/{id}/drafts` | owner | `usp_SaveDraft` | — (pre-audit) |
| `GET /workspaces/{id}/drafts` | owner | `usp_GetDraftsForUser` | — |
| `GET /drafts/{draftId}` | owner | `usp_GetDraftById` | — |
| `DELETE /drafts/{draftId}` | owner | `usp_DeleteDraft` (hard delete) | — |

## Access & error mapping

- Ownership/level violations and non-existent records both return **403, never 404** (existence is
  never disclosed — BS §22.6). `usp_GetRequestByIdForUser` bakes membership into its join; a
  record-scoped mutation resolves the record, then requires Member+ on that record's workspace.
- PATCH is optimistic-concurrency: the base64 `RowVer` ETag arrives via the `If-Match` header (or
  `body.ifMatch`); a mismatch (`THROW 50040`) → **409 `stale-record`**, not-found (`50043`) → 403.
  A missing ETag → 400.
- Stage move on an invalid target stage (`THROW 50041`) → **400**.
- Event payloads carry ids/enums only — never field values, names, descriptions, or requestor PII
  (api-pii-handling.md).

## Display status & SLA derivation

`displayStatus` precedence (matches the migration-019 seed rules): `fields.outcome` if set →
`fields.holdBlocked == "true"` → "On hold" → the current stage's **Label** (fallback: stage key).
List `slaStatus`: due < today → `Overdue`, due ≤ today+3 → `DueSoon`, else omitted (`IClock` today).

## Slice-5 boundaries (deferred)

`queuedRelatedRecordIds` (typed links, slice 10), gate firing on stage move (slice 8), escalation
`bridge` block (slice 9), `Outcome` / close, and real `slaStatus` derivation (Phase 2) are all out
of scope. `RequestDto.outcome`/`bridge`/`slaStatus` are `null` on detail; the list computes the
simple due-date `slaStatus`.

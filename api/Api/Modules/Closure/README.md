# Closure

Closes a record with an Outcome (BS §8, api-contracts.md §3/§8). `POST /requests/{id}/close`.

- `ClosureService` reads the record on the caller's side via `IRequestsService.GetByIdAsync`
  (forbidden / non-existent → 403, BS §22.6), requires Member+, then persists the outcome into the
  record's `FieldValues` JSON via `usp_CloseRequest` (no dedicated columns — the existing
  Display / Mirror Status derivations read `$.outcome`). Emits one `request.closed` event.
- `Validate` (pure, unit-tested) enforces the cross-field rule: Outcome = Duplicate requires
  `duplicateOfRecordId`.

Depends on: Requests (read + re-map). Slice 10.

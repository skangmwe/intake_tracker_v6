---
slice: 10-closure-copy-links
capability: Close a record with an Outcome; Copy any record to a fresh unlinked draft (same or different workspace) with an optional related / re-pursuit-of link back; add typed links manually via the Relationships card; and Promote a task to its own request.
spec-section: BS §2.2 (typed links), §5 (Copy), §6.7 (re-pursuit), §8 (outcomes and closure); api-contracts.md §3, §9
started: 2026-07-04T22:31:34-04:00
ended: 2026-07-04T23:19:24-04:00
duration: 00:47:50
---

# Slice 10 — Closure, Copy, Re-pursuit + Typed links

Closure, Copy, and typed links (BS §2.2/§5/§8). Layers touched: DB (`TypedLinks` table + link/close
procs, `usp_CreateRequest` queued-link stamping, `usp_GetTaskById`), API (new Closure + TypedLinks
modules, Requests create-links + Outcome mapping, Tasks promote-to-request), Web (closure + typed-links
features, record-detail Status tab, Tasks tab promote, intake-form draft-forward wiring).

## Decisions (surfaced + confirmed)

- **Module homes follow the Escalation precedent + the scaffold.** Close lives in its own `Closure`
  module (not bolted onto `RequestsService`); Copy + typed links live in the `TypedLinks` module —
  mirroring how escalate lives in `Escalation`. Both depend on `IRequestsService.GetByIdAsync` for the
  access-gated read (forbidden / non-existent → 403, never 404, BS §22.6). This keeps `RequestsService`
  from growing and matches api-contracts §9 (Copy grouped with typed links).
- **`includeAttachments` on Copy is accepted but a no-op in slice 10** — the `Attachments` table lands
  in slice 11 (the same forced-by-build-order deferral escalation made for attachment carry-across).
  The toggle ships on S19; carry-across wires in slice 11.
- **A copy/promote link-back is queued on the draft, stamped as a real typed link at submission.** A
  Draft is pre-record (no RecordId), so it cannot hold a TypedLink. Copy writes the link-back into the
  draft body's `queuedLinks`; `usp_CreateRequest` gained an optional `@QueuedLinksJson` param and stamps
  each queued link in-transaction (best-effort — a non-existent target is silently skipped, so a queued
  link never fails the create). This reuses/extends the slice-5 `queuedRelatedRecordIds` mechanism. The
  intake form now seeds queued links from a resumed draft and forwards them on submit, and persists them
  on Save draft — so the round trip is real end-to-end.
- **Close stores the Outcome in `Requests.FieldValues` JSON** (matching how Hold is stored), so the
  existing Display / Mirror Status derivations pick it up (`$.outcome` first). Zero new columns; the
  PG-side mirror "closes" correctly. `RequestsService.MapRow` now builds the `Outcome` block from those
  keys (`MapOutcome`, pure + unit-tested).
- **Types reconciled to `collaboration.ts` (no new `typed-links.ts`).** The scaffold already defined
  `TypedLinkDto` / `TypedLinkKind` / `TypedLinkCreateRequest` / `CopyRequest` there. Slice 10 extended
  `TypedLinkDto` with access-respecting `toName` / `toStage` (null when the caller can't see the far
  side — id-only disclosure), removed the unused `createdBy`, and added `LinkBackKind`, `CopyResult`,
  and `QueuedLink`. A first (mistaken) duplicate `typed-links.ts` was deleted before build.
- **`duplicate-of` same-family rule is a prefix check.** `usp_CreateTypedLink` requires the target to
  share the source's id prefix ("workspace family") — an escalated record's PG/AI counterpart shares the
  canonical id, so the counterpart is permitted. `sourced-from` is lenient in Phase 1 (its only legal
  source is a Feature, slice 14) — the kind is accepted but not Feature-origin-enforced yet.
- **Link add/remove emit `link.added` / `link.removed`** on the event spine (ids/kinds only). Delete
  returns the FROM record from the proc so the removal event can be keyed to the caller's side.

## Runbook / contract points

- New table: `TypedLinks` (migration `20260704_038` + rollback). No hard FK to `Requests` (like
  Comments / AuditEntry — the shared canonical id is intentionally not unique across the two rows).
- New procs (idempotent `CREATE OR ALTER`): `usp_CreateTypedLink`, `usp_GetTypedLinksForRecord`,
  `usp_DeleteTypedLink` (`database/procedures/links/`), `usp_CloseRequest` (`database/procedures/requests/`),
  `usp_GetTaskById` (`database/procedures/tasks/`). `usp_CreateRequest` gained an **optional trailing
  `@QueuedLinksJson`** param (backward-compatible — existing callers/tests default it NULL).
- New API modules: `Closure` (`POST /requests/{id}/close`), `TypedLinks` (`GET/POST /records/{id}/links`,
  `DELETE /links/{id}`, `POST /records/{id}/copy`). Tasks gained `POST /tasks/{id}/promote-to-request`.
  DI registration order: TypedLinks + Copy before Tasks (Tasks promote depends on `ICopyService`).
- Web: shared `Modal` primitive extracted to `shared/components/Disclosure/` (escalate/close/link/copy
  all use modals now — escalate keeps its own for surgical scope). New `closure` + `typed-links` feature
  folders; the record-detail Status tab hosts the Relationships card + Close-record action; the Tasks
  tab hosts a per-task Promote action that opens the created draft in the intake form.

## Test-coverage note

- API unit tests cover the pre-persist branches (403s, validation, cancellation) with mocked
  `IRequestsService` / `IAccessGuard` / `IEventSpine` + a never-connected DbContext (the EscalationService
  precedent), plus `CopyService`'s happy path fully (its only DB dep is the mocked `IDraftsService`), and
  the pure `BuildQueuedLinksJson` / `MapOutcome` / `ClosureService.Validate` helpers.
- tSQLt covers the link procs (create + projection, self / missing-target / duplicate-family guards,
  far-name hidden for a non-member, soft-delete gated by membership) and `usp_CloseRequest`
  (outcome-into-FieldValues, Duplicate target, not-found guard). The `usp_CreateRequest` queued-link
  OPENJSON stamping is covered by the C# `BuildQueuedLinksJson` unit test + the LocalDB round-trip.
- Web component tests + jest-axe cover the shared `Modal`, `CloseRecordModal`, and the `RelationshipsCard`
  (+ the Link / Copy modals it opens); `TaskRow` gained Promote-action coverage.

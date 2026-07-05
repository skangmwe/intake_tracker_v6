---
slice: 09-escalation
capability: A PG member escalates a Request; the AI-side record is created with the shared canonical ID, the PG-side crossing fields lock, the AI Solutions Status mirror opens, and the AI Intake group is notified via the escalation event. The PG-side view surfaces bridge provenance via an "Escalated · [origin]" header pill, inline pale-gold crossed-field markers, and a slim mirror note.
spec-section: BS §6 (the escalation bridge); api-contracts.md §4
started: 2026-07-04T21:09:44-04:00
ended: 2026-07-04T21:55:22-04:00
duration: 00:45:38
---

# Slice 9 — Escalation bridge (S5 prototyped, S18 deferred)

The single most load-bearing mechanism (BS §6). Built on the two-row shared-ID `Requests`
model + the `RequestCrossingSnapshot` table (both created in slice 5). Layers touched: DB procs,
Escalation module, Requests-read bridge composition + PATCH lock, S18 modal + S5 record variant.

## Decisions (surfaced + confirmed)

- **AI Solutions Status mirror = read-time derivation (confirmed with the analyst).** The dev/test
  stack has no Service Bus (the event-spine publish is a no-op), so a Worker mirror consumer would
  not fire in tests or the local demo. The PG-side AI Solutions Status is instead **derived live**
  from the AI-side counterpart row's current stage + hold/outcome whenever the bridge block is read
  (`RequestsService.DeriveMirrorStatus`, pure + unit-tested; Deploy/Post-launch → "Deployed"). No
  stored column, no trigger, always current. Faithful to the observable spec (BS §6.4); the stored,
  event-driven, condition-engine-keyable field is deferred to Phase 2 (slice 23 dashboards) when
  something first keys on it. This is why slice 9 adds **zero migrations** — the bridge is derived
  entirely from the two shared-ID rows + `RequestCrossingSnapshot`, and snapshot-presence on a side
  is the PG-side lock signal.
- **"No manual write path" for AI Solutions Status** is enforced at the PATCH boundary, not a DB
  trigger (the field is derived, not stored): `usp_...`-independent guard `IsLockedFieldViolation`
  rejects any patch touching a platform-defined key (`ai-solutions-status`, `record-id`, `workspace`,
  `origin`, `created-at`, `updated-at`) → **403 platform-defined-field-locked**.
- **Attachment carry-across is deferred to slice 11** (forced by build order). The plan's slice-9
  scope says "attachments follow the record," but the `Attachments` table is created in slice 11.
  Slice 9 cannot copy attachments; slice 11 owns escalation-time attachment carry-across.
- **`EscalateResult.aiRecord` is null for a PG-only escalator** (the common case). Per BS §6.4 the
  escalator generally cannot see the AI record, so returning it would leak AI-side data. The web
  refetches the now-escalated PG record (which carries the bridge block); `aiRecord` is typed
  nullable. Shared-type change: `BridgeBlock.lockedFields` is `string[]` (crossing field **keys**,
  matched against the intake form's `fieldKey`), not `FieldDefinitionId[]`.
- **Crossing map source = `FieldDefinition` (`Category='Crossing'` + `CrossingToFieldKey`).** No
  separate `CrossingMap` table in Phase 1 (that admin surface is slice 19/24). `CrossingMapReader`
  reads it via `usp_GetCrossingFields`; the 1:1 same-key seed makes the snapshot→AI-map trivial.
- **The event `escalation.opened` is emitted on the PG workspace** (where the actor acted, so it
  lands in the PG record's activity thread). The AI-Intake notification fan-out reads it in slice 12;
  the payload carries `{ originWorkspaceId, aiWorkspaceId }` — ids only, no PII.

## Runbook / contract points

- New procs (idempotent `CREATE OR ALTER`, applied every runner pass): `usp_EscalateRequest`
  (transactional: one-time/one-way guard 50044, can't-escalate-AI-record 50046, snapshot + adopt +
  Intake landing), `usp_GetBridgeForRecord` (membership-gated caller side + system read of the AI
  side for the mirror), `usp_GetCrossingFields`.
- `usp_GetRequestByIdForUser` is unchanged; the bridge is a **second** read (`usp_GetBridgeForRecord`)
  composed in `ReadAndMapAsync`, so every record read now issues one extra proc call (returns nothing
  for non-escalated records).
- S5 renders on both sides: the marker shows on every crossing field, but the field is **disabled on
  the PG side only** (`onAiSide = request.workspaceId === bridge.aiWorkspaceId`) — editable on the AI
  side (BS §6.2 "fully editable AI-side; the lock is conceptual on the PG side").

## Test-coverage note (web)

Global jest branch coverage is **78.82%** — within the `[78%, 80%)` band `web-testing.md` permits
without filler tests, because every required behaviour is covered and the shortfall is not this
slice's code. The escalation feature is **90% branch** (EscalatedIntakeNote/useEscalate 100%,
EscalateModal 88.9% — the residual is the `!dialog` guard and the `isPending` button-label branch;
`api.ts` is a mocked boundary). RecordDetailPage's remaining uncovered branches (`formatDayMonth`
timezone parsing, `slaLabel`, `isForbidden`) are **pre-existing slice-5 helpers**, not escalation
code. Required cases covered: modal render/cancel/confirm/error/Escape/focus-trap, mirror note +
em-dash fallback, origin pill, crossed-field lock (PG disabled / AI editable), escalate-action
show/hide, and the `useEscalate` success/failure paths.

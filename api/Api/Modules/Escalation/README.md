# Escalation

Owns the one-time, one-way bridge (BS §6). Load-bearing. Depends on: Requests (record read),
Fields (crossing map via `Shared/Escalation/CrossingMapReader`), the Event Spine. See
module-boundaries.md § 7.

## What lives here (slice 9)

- `EscalationController` — `POST /api/v1/requests/{recordId}/escalate` (201 `EscalateResult`;
  403 denied; 409 already-escalated; 400 pending-crossing-edits / missing-required / invalid-target).
- `EscalationService` — reads the PG record (access-baked), validates required crossing fields,
  assembles the AI-side field map + PG-side crossing snapshot in C#, persists atomically through
  `usp_EscalateRequest`, and emits one `escalation.opened` event on the PG side.
- `EscalationDtos` — `EscalateRequest` (`confirmPendingEdits`) + `EscalateResult`
  (`recordId`, `aiWorkspaceId`, nullable `aiRecord`).

## What does not live here

- The crossing-map read helper (`Shared/Escalation/CrossingMapReader`) and the bridge read + mirror
  derivation used by the Requests read path (`Shared/Escalation/BridgeReader` +
  `RequestsService.DeriveMirrorStatus`) live in `Shared/` so the Requests module can compose the DTO
  bridge block and enforce the PG-side crossing lock without a Requests↔Escalation cycle.
- The AI Solutions Status mirror is **derived read-time** from the AI-side row (slice-9 decision — the
  dev/test stack has no Service Bus). No stored column, no trigger, no consumer. The stored,
  event-driven field is Phase 2.
- Attachment carry-across on escalation is **slice 11** (its table doesn't exist yet).

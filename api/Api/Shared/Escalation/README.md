# Escalation

## What belongs here

- **`CrossingMapReader`** — reads the workspace's Request crossing fields ([S]) off `FieldDefinition`
  (`usp_GetCrossingFields`). The Escalation module uses it to snapshot + map the crossing fields.
- **`BridgeReader`** — reads the escalation-bridge inputs (`usp_GetBridgeForRecord`). Lives here (not
  in Modules/Requests or Modules/Escalation) so the Requests module can compose the DTO `bridge` block
  and enforce the PG-side crossing lock on PATCH **without** a Requests↔Escalation module cycle.

## What does not belong here

The Escalation orchestrator itself — that lives in Modules/Escalation. This folder exposes only the
two read helpers. The AI Solutions Status mirror derivation lives with the DTO in
`RequestsService.DeriveMirrorStatus` (read-time; slice-9 decision).

_Traced from `/artifacts/docs/dev/architecture/shared-inventory.md`._

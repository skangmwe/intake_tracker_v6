# Escalation

## What belongs here

CrossingMap reader — the only external consumer of the crossing-map schema. Used by the Escalation module to snapshot mapped fields.

## What does not belong here

The Escalation orchestrator itself — that lives in Modules/Escalation. This folder just exposes the CrossingMap read helper.

_Traced from `/artifacts/docs/dev/architecture/shared-inventory.md`._

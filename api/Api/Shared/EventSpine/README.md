# EventSpine

## What belongs here

The single event-emission layer per BS §11.1. IEventSpine interface + implementations (in-process + Service Bus transport).

## What does not belong here

Consumers. Audit, Notifications, and Mirror consumers are their own modules that subscribe to the spine — never place their logic here.

_Traced from `/artifacts/docs/dev/architecture/shared-inventory.md`._

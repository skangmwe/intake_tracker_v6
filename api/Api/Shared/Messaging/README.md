# Messaging

## What belongs here

Service Bus publisher + consumer helpers over Azure SDK with Managed Identity auth. Peek-lock defaults per api-worker.md.

## What does not belong here

Per-message handlers. Handler classes live in Worker/Handlers or in each module that owns a specific message type.

_Traced from `/artifacts/docs/dev/architecture/shared-inventory.md`._

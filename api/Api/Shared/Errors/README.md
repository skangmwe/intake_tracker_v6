# Errors

## What belongs here

Global exception handler that maps to RFC 7807 ProblemDetails. Firm error-code catalog (ErrorCode enum), fluent ProblemResponse builder.

## What does not belong here

Per-endpoint validation errors — those return via ValidationProblem() inside the controller. Never expose stack traces or internal exception messages (api-error-handling.md).

_Traced from `/artifacts/docs/dev/architecture/shared-inventory.md`._

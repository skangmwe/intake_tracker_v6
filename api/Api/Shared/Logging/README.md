# Logging

## What belongs here

Serilog configuration + custom enrichers + destructuring policies that redact PII-bearing DTOs to [REDACTED].

## What does not belong here

Log statements themselves — those live in the code that logs them. Never log user content, AI responses, document content, or direct PII (api-pii-handling.md).

_Traced from `/artifacts/docs/dev/architecture/shared-inventory.md`._

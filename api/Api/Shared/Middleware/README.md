# Middleware

## What belongs here

Cross-cutting ASP.NET Core middleware — OperationId, EnsureUser, AFD lockdown, Security headers, Cache-Control defaults. Every entry in the pipeline that runs on every request lives here.

## What does not belong here

Business logic. Domain-specific request handling. Anything that filters or transforms a specific endpoint's payload — that belongs in the endpoint's module or a per-endpoint filter attribute.

_Traced from `/artifacts/docs/dev/architecture/shared-inventory.md`._

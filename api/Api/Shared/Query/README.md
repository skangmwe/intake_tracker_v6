# Query

## What belongs here

Pagination envelope helpers, ETag optimistic-concurrency checks, sparse-PATCH binder, filter-clause builders.

## What does not belong here

Per-endpoint query composition. Each module composes its own queries against EF Core + stored procs.

_Traced from `/artifacts/docs/dev/architecture/shared-inventory.md`._

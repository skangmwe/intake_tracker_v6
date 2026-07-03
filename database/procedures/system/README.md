# System procedures

Cross-cutting stored procedures that other modules call. Named `usp_*` per `database-coding-standards.md`.

## Scaffold state

- **`usp_MintRecordId`** — atomically increments a workspace's `NextSequence` and returns `PREFIX-NNNNNNNN`. Slice 1 (Foundation) adds it.
- **`usp_ResolveOrigin`** — reads the platform prefix registry and returns the originating workspace name for a Record ID. Slice 1.

Each proc must be re-applied on every deploy via `CREATE OR ALTER PROCEDURE` per `database-migrations.md`.

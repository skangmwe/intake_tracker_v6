# slice-announcements-db-api-55f5b98 — code-review findings

**Scope:** DB migration 072 + 8 announcement procs + tSQLt; API entities/DTOs/service/controller + xUnit; `shared/types/announcements.ts`; `web/.../constants.ts`.
**Checklists:** `database-backend.md`, `api-middletier.md`, `web-frontend.md`.
**Design gates:** `check-design-conformance.sh` / design-fidelity render **not triggered** — the only web change is a `.ts` token map + shared types; no `.tsx`/`.css`/`.scss` changed, and the Announcements UI reconciliation is a later slice.

## Iteration 1 — 0 blocking findings

No High/Critical findings. Verified:
- **DB:** every proc `SET NOCOUNT ON`/`XACT_ABORT ON` + `TRY/CATCH`/transaction/`@@TRANCOUNT`/`THROW`; `CREATE OR ALTER`; migration idempotent (`COL_LENGTH`/`IF NOT EXISTS` guards) with a matching rollback; all values parameterized (no dynamic SQL); audit columns + soft-delete filters preserved; explicit column lists (no `SELECT *`); `usp_TickAnnouncements` returns a single result set (not OUTPUT+SELECT both); only `dbo.Announcements` mutated (consistent access order); tick-sweep index justified by the sweep query.
- **API:** all `ExecuteSqlRaw`/`FromSqlRaw` values are `SqlParameter`; `CancellationToken` threaded with `ConfigureAwait(false)`; controller stays validation/routing-only; errors via ProblemDetails / `ValidationProblem`; ownership (403) preserved; read-time display-status derivation single-sourced (`Map` + list builder share `DeriveDisplayStatus`); C# ↔ `shared/types` kept mirrored.

### Low observations (non-blocking — not auto-fixed)
- **L1** — the 30-day auto-archive window is inlined as `DATEADD(DAY, 30, …)` in four procs (create/update/publish/tick). Consistent, but a future change touches four sites. Acceptable as an in-proc business rule; flagged for awareness.
- **L2** — `usp_QueryAnnouncements` (consumer feed) filters stored `Status='Published'`, so a past-due Scheduled row is briefly absent from the feed until the ~60s tick flips it (eventual consistency, self-healing). By design.
- **L3** — author-resolution (`empty → actor`) is expressed in both the controller (membership pre-check) and the service (final resolve). Minor duplication; both apply the identical rule.

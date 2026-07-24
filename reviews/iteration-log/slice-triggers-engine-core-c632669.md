# slice-triggers-engine-core-c632669 — iteration log

**Label:** slice-triggers-engine-core-c632669
**Scope source:** git status (uncommitted) — Slice 1 engine core (DB + API; no frontend)
**Files reviewed:** trigger migrations 081–085, 6 trigger procs + usp_FanOutNotification extension, EF entities, AppDbContext, Program.cs, the Triggers module (options/gateway/evaluator/service), tSQLt tests, xUnit tests
**Final status:** CLEAN

## Iteration 1 — 0 code findings, 0 security findings

**Phase 0 — unit tests.** Full suite green: 831 passed, 0 failed. Added a testability seam
(`IScheduledTriggerEvaluator`) so the `ScheduledTriggerService` orchestration (daily-hour gate, atomic
day-claim, evaluator invocation, finalize) is unit-tested; added `ScheduledTriggerServiceTests` (5 cases).
`ScheduledTriggerEvaluatorTests` (11 cases) cover condition evaluation via the real ConditionEngine,
fire-once/re-nag cadence, recipient resolution (+ watchers flag), the trigger.fired payload shape,
per-record failure-continue, empty-candidate no-op, and cancellation. tSQLt authored for the trigger
procs and the fan-out trigger.fired branch (run in CI; the proc behaviours they assert were additionally
verified against local SQL).

Design gate: not run — no frontend files in scope (`.tsx`/`.css`/`.scss`), so design-conformance and the
design-fidelity render do not apply to this slice.

**Phase 1 — code review (database-backend + api-middletier).** No findings.
- Migrations: PK + 6 audit + soft-delete on every table; FK columns indexed (filtered `WHERE IsDeleted=0`);
  idempotent (`IF NOT EXISTS`) with rollbacks; named constraints; one logical change per file; CHECKs on
  Kind/Cadence/NotificationCategory and the interval invariant.
- Procs: `SET NOCOUNT/XACT_ABORT ON`, `CREATE OR ALTER`, header comments, fully parameterized, no cursors,
  schema-qualified. Reads via keyless-row `FromSqlRaw`; writes via `ExecuteSqlRawAsync` — matches
  api-data-access.md.
- API: interfaces I-prefixed, async methods `Async`-suffixed, descriptive names; `CancellationToken`
  threaded through every async call; `ConfigureAwait(false)` in the gateway/evaluator; DI lifetimes correct
  (gateway/evaluator Scoped, hosted service resolves them per-sweep via `IServiceScopeFactory`); `IOptions<T>`
  for timing config; constants for event type / recipient keys / actor.

**Phase 2 — security review (OWASP).** No findings.
- A03 Injection: all SQL parameterized; recipient ids parsed via `OPENJSON` + `TRY_CONVERT`; no dynamic SQL.
- A01 Access control: system-emitted reminders target only the record's own user-reference fields /
  watchers (users who can already see the record); the fan-out enforces actor-exclusion, disabled-account
  suppression, dedup, and the per-record reminder preference.
- A09 Logging: counts + `DurationMs` + `OperationId` only — no record content, recipient identities, or field
  values logged (api-pii-handling.md). The bell summary uses the admin-authored notice title (like an
  announcement title), not record PII.
- Secrets: none introduced.

- Auto-applied: testability seam + service tests (Phase 0)
- Architectural surfaced: none
- End-of-iteration open set: empty

## Final Status: CLEAN
- Total iterations: 1
- Total findings fixed: 0 (1 proactive testability seam added)
- Architectural deferred: 0
- Architectural rejected: 0

# slice-task-overdue-trigger-6b774e4 — code review

**Layers in scope:** API (`.cs`), Database (`.sql`, migrations). No frontend → design-conformance
and design-fidelity steps not applicable (backend-only slice, mirrors Slice 3).
**Checklists:** `dev-code-review/api-middletier.md`, `dev-code-review/database-backend.md`.

## Iteration 1

### Findings: none blocking.

Reviewed all 9 files against the API and database-backend checklists:

**API — `ScheduledTriggerEvaluator.cs`, `ITriggerGateway.cs`, `Entities.cs`**
- `CancellationToken` accepted and passed through every async method (`RunDailySweepAsync`,
  `EvaluateAuthoredTriggerAsync`, `EvaluateTaskOverdueTriggerAsync`, `FireCandidateAsync`,
  `LoadWatermarksAsync`, both gateway methods). ✓
- `ConfigureAwait(false)` on every await (library code, invoked from a BackgroundService). ✓
- Async methods end in `Async`; descriptive names (no single-letter locals). ✓
- Nullable discipline: `TriggerCandidateRow.FieldValuesJson` now `string?` (Task candidates
  carry no field map); `ParseFieldValues` handles null; `WatermarkKey` falls back to `RecordId`
  via `??`; `AssigneeUserId` pattern-matched `is Guid assignee`. No `!` suppression. ✓
- No exceptions for control flow — the per-candidate `try/catch` is the existing
  batch-continue pattern (one bad fan-out never aborts the sweep), unchanged. ✓
- Logging: no PII / user content. Only `TriggerId`, counts, and duration are logged; the task
  assignee (a user id) is never logged. ✓
- DI: `TriggerGateway` already registered in Slice 1; only a method was added (no new
  registration). Evaluator unchanged in its DI shape. ✓
- Simplicity: the two loops share one `FireCandidateAsync` + `SweepCounters`; no speculative
  abstraction. `ShouldFire`'s parameter renamed `recordId`→`watermarkKey` to match the
  generalised keying. ✓

**Database — `usp_GetTriggerCandidates.sql`, `usp_GetEnabledTaskOverdueTriggers.sql`, migration 090**
- `SET NOCOUNT ON; SET XACT_ABORT ON;` + `CREATE OR ALTER PROCEDURE` + header comment on both
  procs. ✓
- Parameter-sniffing mitigation: `@TriggerId`→`@Trigger`, `@Today`→`@TodayLocal` copied to
  locals. ✓
- Schema-qualified (`dbo.`), explicit columns (no `SELECT *`), explicit `NVARCHAR` lengths,
  typed NULLs via `CAST` so both branches bind the same 4-column shape. ✓
- Soft-delete filter (`IsDeleted = 0`) on every branch; SARGable predicate
  (`DueDate < @TodayLocal`, `Status = N'Open'` — no function on an indexed column). ✓
- Migration 090: idempotent `IF NOT EXISTS`, matching idempotent rollback, `YYYYMMDD_NNN`
  naming, one logical change (a data seed, separate from schema — consistent with seed
  migration 086), header comment, no hardcoded secrets. ✓

### Considered and declined (non-finding)

- **No new index for the Task candidate predicate** `(WorkspaceId, Status, DueDate)`.
  Deliberate: the sweep runs **once daily**, workspace-scoped, over a small task set; the
  existing `(WorkspaceId, RecordId, SortOrder)` filtered index already narrows by workspace.
  `database-performance.md` warns against over-indexing ("justify every index with a specific
  query pattern") — a once-daily scan does not justify one. Revisit only if task volume per
  workspace grows large.

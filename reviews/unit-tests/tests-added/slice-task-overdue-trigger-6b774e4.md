# slice-task-overdue-trigger-6b774e4 — tests added / extended

## Iteration 1

Tests were authored TDD-first during the slice build (RED → GREEN watched for every
positive case). Phase 0 confirmed the required cases per `api-testing-guidelines.md`
(happy path, permanent-failure/skip branches, cancellation) and `database-testing.md`
(AAA, happy/NULL/exclusion) are present; no gap-fill was needed.

### API — `api/Api.Tests/ScheduledTriggerEvaluatorTests.cs` (5 new cases)

- `RunDailySweep_TaskOverdueWithAssignee_EmitsToAssigneeAndStampsTaskWatermark` — happy path:
  overdue task fires `trigger.fired` with `kind=task-overdue`, recipient = assignee, fan-out
  targets the **parent request** id, watermark stamped on the **TaskId**.
- `RunDailySweep_TaskOverdueNoAssignee_SkipsWithoutStamp` — no assignee → no emit and no
  watermark (so assigning later can still fire).
- `RunDailySweep_TaskOverdueOnceWatermarkOnTaskId_DoesNotRefire` — `Once` cadence, watermark
  keyed on TaskId blocks a re-fire.
- `RunDailySweep_TwoOverdueTasksSameRequest_FireIndependentlyPerTask` — two tasks on one
  request; keying on TaskId (not the shared request id) means the second still fires while the
  first is suppressed. Proves the per-task dedup key.
- `RunDailySweep_TaskOverdueCancelledToken_ThrowsWithoutEmitting` — cancellation over the task
  loop.

Existing 11 authored-path cases retained; shared `Arrange`/`Build` updated for the new
`GetCandidatesAsync(triggerId, today, ct)` signature and the defaulted
`GetEnabledTaskOverdueTriggersAsync` (empty) so each loop can be exercised in isolation.

**Result:** 16 `ScheduledTriggerEvaluatorTests` + 51 total `~Trigger` tests green; full
`Api.sln` builds (0 errors).

### Database — `database/tests/triggers/test_Triggers.sql` (tSQLt, CI-only)

- `test usp_GetTriggerCandidates returns only open overdue non-deleted tasks in the workspace`
  — Task branch: open+overdue included; future / Done / no-due-date / soft-deleted / other-ws
  excluded; asserts WatermarkKey=TaskId, RecordId=parent, assignee carried.
- `test usp_GetEnabledTaskOverdueTriggers excludes disabled deleted and authored` — enabled
  TaskOverdue only; ConditionsJson `[]`.
- Existing `usp_GetTriggerCandidates` (Request) test updated for the `@Today` param + 4-column
  shape; `dbo.Tasks` added to the fake-table SetUp.

tSQLt runs in CI only. The proc logic was additionally round-tripped on LocalDB
(`AiSolutionsTrackerDev`): the Task branch returned exactly the one open+overdue task with the
expected shape, the disabled seed (090) was correctly hidden by the enabled-getter, and the
Request branch remained unchanged (WatermarkKey=RecordId, assignee NULL, field map present).

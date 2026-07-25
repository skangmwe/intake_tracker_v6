# slice-task-due-date-4765474 — tests added / extended

## Iteration 1

**API (`api/Api.Tests/TasksControllerTests.cs`):** updated the `SampleTask()` builder for the new positional `TaskDto.DueDate`; added create + patch forwarding cases for `dueDate`. `--filter ~Task` → 44 passed.

**Web (`web/src/features/tasks/`):**
- `TaskComposer.test.tsx` (new) — composer submits `dueDate`; jest-axe.
- `TaskRow.test.tsx` — due-date chip present when set / absent when null; jest-axe.
- `api.test.ts` — create + patch (incl. empty-string clear) carry `dueDate`.
- 6 suites / 62 tests passed.

**Phase 0 added no further cases** — the required happy / boundary (set/clear/absent) coverage was authored in the slice. Beyond the suites, the orchestrator ran a live DB round-trip (create/get/patch-set/patch-clear) that validated the proc contract end-to-end.

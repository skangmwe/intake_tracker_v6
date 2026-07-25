# slice-approval-respond-by-e63197c — tests added / extended

## Iteration 1

Tests authored TDD-first during the build (RED → GREEN watched for every positive case). Phase 0
confirmed the required cases per `api-testing-guidelines.md` and `database-testing.md`; no gap-fill needed.

### API — `api/Api.Tests/ScheduledTriggerEvaluatorTests.cs` (4 new cases)
- `RunDailySweep_ApprovalOverdue_EmitsToEligibleApproversKeyedOnApprovalId` — happy path: overdue gate
  fires `trigger.fired` (`kind=approval-overdue`), recipients = the frozen eligible approvers, fan-out to
  the **parent request**, watermark keyed on the **ApprovalRequestId**.
- `RunDailySweep_ApprovalOverdueNoEligibleApprovers_SkipsWithoutStamp` — empty approver set → no emit, no
  watermark.
- `RunDailySweep_ApprovalOverdueSameApproverInTwoSlots_DedupesRecipients` — one person eligible on two
  slots is notified once.
- `RunDailySweep_ApprovalOverdueCancelledToken_ThrowsWithoutEmitting` — cancellation over the approval loop.

16 prior + 4 new = 20 evaluator cases green. `ApprovalsControllerTests.SampleGate` updated for the new
`ApprovalRequestDto.RespondByDate` positional member. Full `Api.sln` builds; 143 trigger/approval/gate/
workspace tests green.

### Database — tSQLt (CI-only; additionally round-tripped on LocalDB)
- `test_Gates.sql` → `test_OpenGateStampsRespondByDate` — `usp_OpenGate` stamps RespondByDate =
  OpenedAt + the workspace's ApprovalRespondByDays (faked workspace window = 7).
- `test_Triggers.sql` → `test usp_GetTriggerCandidates returns only unresolved overdue non-deleted
  approvals in the workspace` — Approval branch: Pending **and** ChangesRequested overdue gates included;
  Resolved / future respond-by / null respond-by / soft-deleted / other-workspace excluded; asserts
  WatermarkKey=ApprovalRequestId, RecordId=parent request, ApproverSetJson carried.
- `test usp_GetEnabledApprovalOverdueTriggers excludes disabled deleted and other kinds`.
- Existing Request/Task candidate tests updated for the new 5-column shape (`ApproverSetJson`); `dbo.Tasks`
  and `dbo.ApprovalRequests` added to the fake-table SetUp.

**LocalDB round-trip (`AiSolutionsTrackerDev`):** migrations 091/092/093 + all modified procs applied
cleanly; the Approval candidate branch returned exactly the overdue unresolved gate (Resolved excluded,
pre-existing null-respond-by gates excluded), the getter returned the enabled trigger (disabled seed
hidden), and `usp_OpenGate` stamped RespondByDate = OpenedAt + 5 (the AI Solutions window).

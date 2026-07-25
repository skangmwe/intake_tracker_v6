# slice-approval-respond-by-e63197c — code review

**Layers in scope:** API (`.cs`), Database (`.sql`, migrations), one shared type (`shared/types/gates.ts`).
No `.tsx`/`.css`/`.scss` and no `web/src` changes → design-conformance and design-fidelity do not apply
(a backend + shared-type slice; `gates.ts` is a non-visual type contract). Mirrors Slice 3/4b.
**Checklists:** `dev-code-review/api-middletier.md`, `dev-code-review/database-backend.md`.

## Iteration 1

### Findings: none blocking.

**API — evaluator / gateway / entities / gates DTO+service**
- `CancellationToken` threaded through `EvaluateApprovalOverdueTriggerAsync`,
  `GetEnabledApprovalOverdueTriggersAsync`, and the shared `FireCandidateAsync`; `ConfigureAwait(false)`
  on every await. ✓
- `ResolveApproverRecipients` parses the frozen approver set, collects distinct GUID-shaped
  `eligibleMembers[].userId` (case-insensitive dedup, mirroring the authored `ResolveRecipients`). No
  try/catch — matches `ParseFieldValues`; `FrozenApproverSet` carries a `CK ISJSON=1` constraint so the
  input is always valid JSON. ✓
- Nullable discipline: `TriggerCandidateRow.ApproverSetJson` (`string?`) and
  `ApprovalRequestRow.RespondByDate` (`DateOnly?`); no `!` suppression. ✓
- `ApprovalRequestDto` gained a `RespondByDate` positional member; the one test construction was updated,
  and `MapApproval` maps it. `AppDbContext` configures `ApprovalRespondByDays` HasDefaultValue(5), mirroring
  `BenefitReviewOffsetDays`. ✓
- Descriptive names throughout (no single-letter locals). ✓

**Database — usp_OpenGate / candidate proc / getter / view + read procs / migrations**
- `usp_OpenGate` reads the workspace window and stamps `RespondByDate = OpenedAt + ApprovalRespondByDays`
  (locals copied for sniffing; `ISNULL(@Days,5)` defence). `SET NOCOUNT/XACT_ABORT`, header comment, and the
  transaction/`TRY..CATCH`/`THROW` structure are unchanged. ✓
- `usp_GetTriggerCandidates` Approval branch: `State <> N'Resolved' AND RespondByDate IS NOT NULL AND
  RespondByDate < @TodayLocal`, soft-delete + workspace scoped, SARGable; all three branches emit the same
  5-column shape with typed `CAST(NULL …)`. New `usp_GetEnabledApprovalOverdueTriggers` mirrors the task
  getter. ✓
- `RespondByDate` added to `vw_ApprovalRequestDetail` and all four projecting read procs (open / list /
  submit / re-request) so the keyless `ApprovalRequestRow` bind stays consistent. ✓
- Migrations 091/092 (schema, idempotent + `MigrationHistory` + rollback, default 5 mirrors 087) and 093
  (disabled opt-in seed, idempotent + rollback). ✓

### Considered and declined (non-findings)
- **No new index for the Approval candidate predicate** `(WorkspaceId, State, RespondByDate)` — once-daily,
  workspace-scoped sweep over a small set; `database-performance.md` warns against unjustified indexes. Same
  rationale as the Task branch in 4b.
- **Three parallel built-in getters/loops** (authored / task / approval) — a deliberate per-kind pattern;
  only two built-in kinds exist and Phase 3 ends here, so this is not runaway duplication. Not unified, to
  avoid churning the shipped 4b getter/gateway.

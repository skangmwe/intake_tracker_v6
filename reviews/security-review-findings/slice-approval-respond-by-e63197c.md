# slice-approval-respond-by-e63197c — security review

**Checklists:** `dev-security-review/api-middletier-security.md`,
`dev-security-review/database-backend-security.md` (OWASP A01–A10 + data-protection).

## Iteration 1

### Findings: none.

- **A03 Injection / SQL injection** — `usp_OpenGate` and `usp_GetTriggerCandidates` use typed parameters
  and locals; the gateway calls procs via `FromSqlRaw` with `SqlParameter` bindings. `FrozenApproverSet` is
  read as stored data and parsed in C# (`ResolveApproverRecipients`), never concatenated into SQL. ✓
- **A01 Broken access control** — no new user-facing surface. The evaluator is a system-scheduled sweep
  (no user context). `usp_OpenGate`'s membership access-gate is unchanged. RespondByDate is exposed on the
  read path only through `usp_GetApprovalRequestsForRecord`, which joins `WorkspaceMembership` — so only
  workspace members see it. The seed (093) is scoped to one workspace. ✓
- **A02 / data protection — PII in logs** — the frozen approver set contains `displayName` (PII); it is
  parsed for user ids but **never logged** (marked confidential on `TriggerCandidateRow.ApproverSetJson`).
  The evaluator logs only `TriggerId`, counts, and duration; approver user ids flow to the event payload for
  fan-out, not to any log sink (`api-logging.md` / `api-pii-handling.md`). ✓
- **A04 Insecure design** — fan-out targets the parent request id (`NVARCHAR(20)`) while the dedup watermark
  keys on the `ApprovalRequestId` (36-char GUID in the `NVARCHAR(64)` fire table). Widths verified against
  the real schema; no truncation. `includeWatchers=false` for approval-overdue — only the frozen eligible
  approvers are notified, no unintended broadcast. ✓
- **A05 Security misconfiguration** — the seeded trigger ships **disabled** (`IsEnabled=0`, opt-in). ✓
- **A08 Data integrity** — migrations 091/092/093 are idempotent with idempotent rollbacks; no secrets or
  environment-specific values. ✓

No mechanical or pending-decision security findings.

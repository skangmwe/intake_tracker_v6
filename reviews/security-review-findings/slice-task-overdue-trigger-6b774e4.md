# slice-task-overdue-trigger-6b774e4 — security review

**Checklists:** `dev-security-review/api-middletier-security.md`,
`dev-security-review/database-backend-security.md` (OWASP A01–A10 + data-protection).

## Iteration 1

### Findings: none.

- **A03 Injection / SQL injection** — `usp_GetTriggerCandidates` takes `@TriggerId` +
  `@Today` as typed parameters; no dynamic SQL, no string concatenation. The gateway calls
  them via `FromSqlRaw` with `SqlParameter` bindings (`@TriggerId`, `@Today`) — fully
  parameterized per `api-data-access.md`. The new getter takes no params. ✓
- **A01 Broken access control** — the evaluator is a system-scheduled BackgroundService sweep;
  it has no HTTP/user context and introduces no user-facing endpoint. Triggers are
  admin-configured; recipients are resolved deterministically (the overdue task's assignee).
  No authorization surface is added or bypassed. The seed (090) is scoped to a single
  workspace — no cross-tenant reach. ✓
- **A02 / data protection — PII in logs** — no user content, task text, or user identity is
  logged. Log statements carry only `TriggerId`, aggregate counts, and duration
  (`api-logging.md` / `api-pii-handling.md`). The assignee user id flows only into the event
  payload for fan-out, never to a log sink. ✓
- **A04 Insecure design** — fan-out targets the parent request id (`NVARCHAR(20)`) while the
  dedup watermark keys on the TaskId (stored in the `NVARCHAR(64)` fire table). Widths were
  verified against the real schema; no truncation risk. `includeWatchers=false` for the
  task-overdue kind — the notification reaches only the assignee, no unintended broadcast. ✓
- **A05 Security misconfiguration** — the seeded trigger ships **disabled** (`IsEnabled=0`,
  opt-in) so no notifications fire until an admin enables it. ✓
- **A08 Data integrity** — migration 090 is idempotent with an idempotent rollback; no secrets
  or environment-specific values embedded. ✓
- **Secrets** — none introduced (`api-secrets.md`). ✓

No mechanical or pending-decision security findings.

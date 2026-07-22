# Test failures / gaps — fix-rename-standard-delivery-ca68ddd

## Iteration 1

### Pre-existing (NOT a regression from this change) — tSQLt files do not compile
- **Files:** `database/tests/requests/test_Escalation.sql`, `database/tests/lifecycle/test_usp_SaveLifecycleConfig.sql`
- **Symptom:** loading either file into LocalDB fails with `Msg 102, Level 15 — Incorrect syntax near '('` on the assertion lines (`EXEC tSQLt.AssertEquals @Expected = N, @Actual = (SELECT COUNT(*) …)`). A scalar subquery cannot be passed as a stored-proc parameter value, so the test procedures fail to CREATE.
- **Scope:** repo-wide (~206 occurrences of this pattern across the tSQLt suite). Independent of this change.
- **This change's touch:** a single inert SetUp fixture line per file (`N'Standard delivery'` / JSON `"name": "Standard delivery"`), on lines separate from the failing assertions. The swap does not affect compilability or any assertion.
- **Classification:** Pre-existing / out-of-scope. Fix class: Architectural (repo-wide tSQLt assertion refactor) — not remediated in a lifecycle-rename slice per Code Discipline (surgical changes; leave pre-existing conditions alone unless asked).
- **Compensating verification:** the DB deliverable (migration 074 + rollback) was verified directly against LocalDB `AiSolutionsTracker`: forward apply renamed the row, re-run was a no-op (idempotent), rollback restored the old Name and removed the history row, re-apply returned to "Standard delivery".

No failures attributable to this change.

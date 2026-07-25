# slice-task-due-date-4765474 — security-review findings

## Iteration 1

No findings. OWASP pass on the diff:
- No dynamic SQL — all `FromSqlRaw` calls pass `@DueDate` as a `SqlParameter`; procs are parameterized; the seed migration inserts a static literal catalog row.
- No PII / task-field-value logging added; DueDate is a plain date.
- Access control unchanged — `usp_CreateTask`/`usp_PatchTask` re-gate via `WorkspaceMembership`; the new column bypasses no gate.
- No secrets; DueDate rendered via `formatDate` (no `dangerouslySetInnerHTML`/`eval`).

Out of scope (pre-existing): `NU1903` advisory on `System.Security.Cryptography.Xml` in the test project's transitive deps — not introduced by this diff.

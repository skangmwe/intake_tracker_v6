# slice-sla-aging-007240f — security-review findings (OWASP)

## Iteration 1

**No Critical/High/Medium findings in slice-21 code.**

- **A01 Broken access control** — `usp_GetRequestByIdForUser` still filters through `WorkspaceMembership` (an inaccessible or non-existent record returns zero rows → API 403-uniform, never discloses existence). The added `Workspaces` inner join resolves the record's own workspace window; it does not widen the accessible set. Stage-set access is checked API-side (unchanged).
- **A03 Injection** — every dynamic value in the four touched procs is a `SqlParameter` / proc parameter; the `EXEC dbo.usp_QueryRequests …` command text in the service is a compile-time constant; the new `DueDate`/`StageEnteredAt`/`DueSoonWindowDays` columns are static SELECT projections. No concatenation.
- **A09 Logging / PII** — no new log statements; `DueDate`/`StageEnteredAt`/`DueSoonWindowDays` are non-PII operational values; `ConditionEngine` logs nothing. `Cache-Control: private, no-store` middleware unchanged.
- **A06 Vulnerable/outdated components** — no new npm or NuGet dependencies.
- **Secrets** — none touched.

No mechanical fixes required. No Pending-decision items.

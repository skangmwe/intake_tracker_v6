# slice/relationships-schema — unit-test failures / gaps

**Label:** slice-relationships-schema
**Iteration:** 1
**Runner:** /dev-review-and-remediate (Phase 0)

## Iteration 1

### Test infrastructure gap (blocking)

- **Environment does not have runnable test infrastructure available in this session.** `dotnet test` and `npm test` were not invoked because the local dev environment (SQL Server LocalDB, populated `node_modules`, matching .NET SDK) is not provisioned in this Claude Code session. On a workstation with the standard project setup, the tests below would run and either pass or fail. This is a **process gap** for the run, not a test failure.

### Missing required test cases (per layer rules)

| # | File | Missing case | Rule |
|---|------|--------------|------|
| T-1 | `api/Api/Modules/Relationships/RelationshipsService.cs` | happy-path xUnit for every public method (List, GetById, Create, Update, Retire happy, Retire-with-links 409, Restore, ListRecordLinks, CreateRecordLink, DeleteRecordLink) | api-testing-guidelines.md#service-tests |
| T-2 | `api/Api/Modules/Relationships/RelationshipsService.cs` | permanent-failure xUnit — mock `SqlException` for 50060/50061/50062/50063; assert no retry and appropriate `RelationshipMutationOutcome`/`RecordLinkMutationResult` | api-testing-guidelines.md#service-tests |
| T-3 | `api/Api/Modules/Relationships/RelationshipsService.cs` | cancellation xUnit — pass a cancelled `CancellationToken` and assert clean exit | api-testing-guidelines.md#service-tests |
| T-4 | `api/Api/Modules/Relationships/RelationshipsController.cs` | at least one integration test per endpoint via `WebApplicationFactory<Program>` | api-testing-guidelines.md#integration |
| T-5 | `api/Api/Modules/Relationships/RecordLinksController.cs` | at least one integration test per endpoint | api-testing-guidelines.md#integration |
| T-6 | `web/src/features/relationships/RelationshipsSidePanel.tsx` | jest + jest-axe for loading / error / empty / populated states | web-testing.md#component-tests |
| T-7 | `web/src/features/relationships/useRelationshipTabs.ts` | jest for hook — abort-on-unmount cleanup, error branch, filter+sort logic | web-testing.md#hook-tests |
| T-8 | `web/src/features/relationships/api.ts` | thin — covered by hook + component tests; no additional required case |
| T-9 | `database/procedures/relationships/*.sql` | **tSQLt authored** (two classes in `database/tests/relationships/`) covering the required cases per `database-testing.md`. **Not run** in this session — SQL Server LocalDB not provisioned here. |

### Coverage delta

- Frontend coverage for `web/src/features/relationships/**` is **0%** as of this cut (no jest tests exist). `jest.config.ts`'s 80% floor cannot be met without T-6 and T-7.
- Backend coverage for `api/Api/Modules/Relationships/**` is **0%** for the same reason.

### Status

- **Phase 0 result: BLOCKED** — cannot mark clean because the required-case gaps above are real (documented in `web-testing.md` and `api-testing-guidelines.md`) and are known to be deferred per the slice doc.
- Every gap is architectural (a scope decision made when the slice split into two sessions), not mechanical — so auto-remediation of Phase 0 does not apply.

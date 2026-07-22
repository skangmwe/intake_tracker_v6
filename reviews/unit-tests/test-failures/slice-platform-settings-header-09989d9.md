# slice-platform-settings-header-09989d9 — test failures / gaps

## Iteration 1

No failures. All authored/extended tests pass.

- API: 745 passed, 0 failed.
- Web: 1505 passed, 0 failed; coverage thresholds met.
- Database: `test_usp_GetPlatformRelationships` ships with the proc; tSQLt executes in the test-tenant DB (not runnable in the local dev environment — no gap in authoring).

No required-case gaps identified for the changed source per api-testing-guidelines.md / web-testing.md / database-testing.md.

# fix-requests-due-date-year — tests

## Iteration 1

No new tests required. The existing `RequestsListPage.test.tsx` already covers the change's contract:
- `RequestsListPage — overdue` asserts the aging suffix (`/· overdue/`) — preserved by the fix.
- `RequestsListPage — a malformed due date renders an em-dash` exercises the `formatDue` guard — preserved.

Neither asserts a word-month string, so the switch to numeric `formatDate` output needs no test edit.

**Run:** full suite `npm run test:coverage` → **263 suites, 1528 tests, all pass** (exit 0). Coverage met.

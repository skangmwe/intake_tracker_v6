# Remediations applied — slice-similar-requests-activity-cd32a6a

## Iteration 1

### Phase: 0 — `renderBody` fragmented comment text across per-word spans (Mechanical, source fix)
- **File:** `web/src/features/comments/ActivityTab.tsx`
- **Surfaced by:** `ActivityTab.test.tsx` — "interleaves a system event and a comment" (`getByText(/Looks good/)` could not find the text).
- **Root cause:** `renderBody` split the body on whitespace and wrapped **every** word in its own `<span>`, so "Looks good" spanned two elements — breaking substring queries, bloating the DOM, and breaking text selection/copy.
- **Fix:** rewrote `renderBody` to a boundary-aware `matchAll` tokenizer (same `@mention` rule as `parseMentions`, no lookbehind for browser support) that keeps non-mention text in **contiguous runs** and wraps only mention tokens.
- **Verified:** web suite re-run → 20/20 (scoped) then 436/436 (full). Green.

### Phase: 0 — branch-coverage top-up (test additions, not source changes)
- Added `web/src/features/comments/api.test.ts` (thread narrowing — the 3 `narrow()` branches — + `postComment`), `web/src/features/comments/useComments.test.tsx` (`useThread` enabled/disabled + `usePostComment` invalidation), and `web/src/features/requests/similarRequests.test.tsx` (`findSimilarRequests` + `useSimilarRequests` enabled/min-length/no-workspace branches).
- **Result:** global branch coverage 77.33% → **78.66%** (within the `web-testing.md` [78%, 80%) acceptance band; statements 88.27% / functions 84.09% / lines 89.43% all ≥ 80%). All required behaviour cases covered; remaining uncovered branches are defensive fallbacks in the new code + edge handlers on large pre-existing list/detail components (same class of residual as slice 5, which shipped at 78.6%).

### Phase: 0 — tSQLt test-bugs surfaced by the real run (Mechanical, test fixes)
Deployed tSQLt + all 33 migrations + 35 procs to `IntakeTrackerTest` (LocalDB, SQL 2016) and ran the slice-6 classes. Two real test-authoring bugs were found and fixed:
1. **Subquery passed directly as an EXEC parameter** inside a procedure body (`EXEC tSQLt.AssertEquals @Actual = (SELECT COUNT(*) …)`) — valid ad-hoc, but a **syntax error inside a stored procedure**. Rewrote every count assertion in `test_Comments.sql` + `test_SimilarRequests.sql` to read into a local variable first.
2. **`NVARCHAR(MAX)` can't be passed as `SQL_VARIANT`** to `tSQLt.AssertEquals` (LOB types unsupported) — the body assertion used `@Body NVARCHAR(MAX)`. Bounded it to `NVARCHAR(256)`.

**Result: 13/13 pass** — CommentsTests 8/8, SimilarRequestsTests 5/5.

**Pre-existing finding (out of slice scope, not fixed):** the same subquery-as-EXEC-param pattern exists in the pre-existing tSQLt files (`test_RequestsCore.sql`, `test_Drafts.sql`, `test_QueryRequests.sql`, fields/lifecycle/platform/audit tests) — meaning those tSQLt tests would fail to load and **were never actually executed** in prior slice gates. Recorded here for follow-up; not remediated in this slice (surgical scope). Recommend a dedicated cleanup slice to make the existing tSQLt suite runnable.

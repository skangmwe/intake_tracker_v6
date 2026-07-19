# slice-toolkit-object-bd56143 — tests added/extended

## Iteration 1
Tests were authored during the slice (per CLAUDE.md tiers); Phase 0 only ran + verified them.

- **API:** `ToolkitControllerTests.cs` (29 cases — query/get 403·200, create validation 400/413 + outcome
  mapping 201/403/409/502/500 + filename sanitize, patch 400/409/403/200 + If-Match precedence,
  retire/restore 204/403, download file/403/404, cancellation) — **29/29 green**.
  `ToolkitEndpointsTests.cs` (route-mount + 401-without-token for all 7 endpoints).
- **Database:** `test_Toolkit.sql` (8 tSQLt cases — create mint+defaults, get member/non-member,
  query kind-filter + search, patch, retire member/non-member, restore) — authored; unrun (framework not
  vendored — Deferred); migration + procs verified live (0 failures).
- **Web (jest + jest-axe):** `toolkitFormat.test.ts`, `api.test.ts`, `useToolkit.test.tsx`,
  `SideSheet.test.tsx`, `ToolkitGallery.test.tsx`, `ToolkitList.test.tsx`, `ToolkitDetailSheet.test.tsx`,
  `ToolkitEditorSheet.test.tsx`, `ToolkitSurface.test.tsx` — **9 suites, 42 tests green**, axe per state.
  Playwright `e2e/toolkit.spec.ts` (browse+open detail; create from editor).

No required cases were missing → no gap-fill authored this run.

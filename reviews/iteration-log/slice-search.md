# slice-search — review & remediation log

**Label:** slice-search
**Scope:** slice 15 (Search) — DB procs + API module + web feature + shared extraction
**Final status:** SHIPPED-WITH-CI-DEFERRED-GATES (explicit developer authorization)

## What ran locally and passed

| Gate | Result |
|---|---|
| Web unit + jest-axe | 697 pass (32 slice-15 tests + suite). No regressions. |
| Web E2E (Playwright, chromium) | 2/2 pass — full top-bar-search → S27 results flow; search surface axe-clean. |
| API `dotnet test` | 8/8 Search (6 controller unit + 2 endpoints); 372 total pass. |
| `tsc --noEmit` | slice-15 files clean. |
| Design-conformance | slice-15 styles are token-only (verified per-file; the hook hangs in this shell). |
| Code review (static) | clean — thin controller, parameterized SQL, access-gated procs, no `any`/`console`/`dangerouslySetInnerHTML`, `data-ds` present, component lengths OK. |
| Security review (static) | clean — no SQL injection (SqlParameter + escaped LIKE), no XSS (React nodes not innerHTML), no PII logged, no new deps, `private,no-store`. |

## Defects found and fixed (Phase 0/1)

1. **[a11y / High]** `WorkspaceSearch` put the "See all results" action button inside `role="listbox"` → `aria-required-children` violation. **Fix:** dropped listbox/option roles for a semantic `<ul>` of buttons + `role="group"`. Re-ran jest-axe → clean.
2. **[regression / Mechanical]** `TopBar.test.tsx` queried the search input as `textbox`; slice 15 changed it to `type="search"` (role `searchbox`). **Fix:** updated the assertion.
3. **[compile / Mechanical]** `SearchService.cs` used `GetDbConnection()` without `using Microsoft.EntityFrameworkCore;` → API didn't build. **Fix:** added the using. Re-ran `dotnet test` → pass.
4. **[e2e test bug / Mechanical]** `getByText('Record')` matched the intro paragraph ("Across **record**s…") under substring matching. **Fix:** `{ exact: true }`.
5. **[e2e scope / Mechanical]** full-page axe tripped on a **pre-existing** slice-2 contrast issue (`.ast-ws-text-kind`) that only renders when a membership kind is mocked. **Fix:** scoped the e2e's axe to `.search-page` (shell a11y is `accessibility.spec.ts`'s job). Filed as a pre-existing finding below.

## Gates NOT run locally (CI-container harness) — deferred to CI

- **tSQLt** (`usp_SearchRecords`, `usp_SearchFull`, `test_Search.sql`) — the project deploys schema + tSQLt inside an mssql container in CI; `sqlcmd` + the tSQLt framework are not present locally and there is no local DB-deploy runner. The procs/tests mirror the proven, CI-passing slice-6 patterns (`usp_FindSimilarRequests` / `test_SimilarRequests`) exactly.
- **Design-fidelity render & compare** — needs the app served with a LocalDB-seeded backend + prototype screenshotting. Slice 15's only prototyped surface is the top-bar search popover within the shell (unchanged slice-2 chrome + token-only result rows); the E2E already rendered the built surface correctly.

**Shipped on explicit developer authorization** with these two gates deferred to CI (as designed). No CLEAN cache was written (the two gates did not execute locally — a CLEAN cache from partial work would be a process violation).

## Pre-existing issues surfaced (NOT caused by slice 15 — out of scope)

- **Global coverage 76% branches / 77% functions** (< 80% floor) — debt from slices 1–14; slice-15 files sit above the average (raise it). Developer accepted as pre-existing.
- **`HealthTests` 500** — confirmed by running on stashed/pristine `dev`: fails identically (default-config app startup). Predates slice 15.
- **13 `tsc` errors** in slice 6/8/11/12 test files (`exactOptionalPropertyTypes`) — none in slice 15.
- **`.ast-ws-text-kind` contrast** (WorkspaceSwitcher, slice 2) — WCAG contrast on the "· hub" muted suffix; surfaces only when a membership kind is present.

These are recommended for a dedicated cleanup, tracked separately — not folded into a feature slice.

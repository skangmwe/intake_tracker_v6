# slice-home-surface-33f06db — iteration log

**Label:** slice-home-surface-33f06db
**Scope source:** git diff (pre-commit; branch slice/home-surface)
**Layers in scope:** database (migration + 5 procs), API (Home module + ConditionEngine), web (home feature), shared types
**Final status:** CLEAN (design-fidelity OVERRIDE-AUTHORIZED)

## Iteration 1 — gate run

### Phase 0 — unit tests
- **API** `dotnet test`: initial 489/1 → **490/490** after 1 mechanical fix.
  - `HomeController` empty-workspace 400 branch used `ValidationProblem(...)` (needs a `ProblemDetailsFactory` from request services, returns a derived `BadRequestObjectResult`). Replaced with a plain `ObjectResult` mirroring `AccessDenied()`. [Phase 0]
- **Web** `jest`: home feature initially 7 failing → **39/39** after fixes; full suite **983/984** (coverage ≥80% met).
  - Renamed `homeView.ts` → `homeFormat.ts` — case-collision with `HomeView.tsx` made `import { HomeView }` resolve to the lowercase helpers module (undefined component; would also break webpack). [Phase 0]
  - `homeFormat.ts` imports the audit helpers from `@/features/audit/constants` (leaf) instead of the barrel (which eagerly loads a full page). [Phase 0]
  - `ActivityPanel.test` — narrowed two over-broad `getByText` matchers (panel title + meta both contained the phrase). [Phase 0]
  - `pages/HomePage.test.tsx` — rewrote for the new behaviour (HomePage now mounts `HomeView`; the old membership-list test was stale). [Phase 0]
  - `HomeView.test.tsx` — removed an unused `waitFor` import (eslint). [Phase 0]
- **Database** tSQLt: authored (5 procs, `test_Home.sql`, 13 cases, slice-precedent FakeTable pattern). No local tSQLt runner in this environment → CI-gated (matches every prior slice).
- `tsc --noEmit`: 0 new errors. `eslint`: clean. Production webpack build: succeeds.

### Phase 1 — code review (design-conformance + design-fidelity + checklist)
- `check-design-conformance.sh --web-required`: **PASS** (0 violations, 279 files — tokens only).
- Design-fidelity (render & compare): built **S1 Home** rendered live (dev server + stub API + dev auth bypass) → **match** to the prototype; shell match; mechanical manifest blocked by the `.dc.html` headless-navigation limitation → **OVERRIDE-AUTHORIZED**. See `design-fidelity-findings/slice-home-surface-33f06db.md`.
- Checklist review (manual, against api-middletier + web-frontend + database-backend): no findings — controllers thin + access-gated (403 never 404), parameterized SQL only, `CancellationToken` threaded, components < 200 lines, all three non-data states rendered, `data-ds`/tokens honoured.

### Phase 2 — security review
- OWASP walk (manual): no findings. Workspace-membership gate on the one read endpoint; every panel proc is workspace-scoped; announcement audience never widens access; no PII in logs (DisplayName returned for the surface only); no XSS/`dangerouslySetInnerHTML`/`eval`; `Cache-Control: private, no-store` default covers the user-scoped Home read.

### Known pre-existing failures (not slice 22 — untouched by this slice, already on `dev`)
- `web` `navItems.test.ts` — asserts 3 nav sections; slice 19 added a 4th ("Platform"). Fails identically on `dev`.
- `web` `platform-admin/api.test.ts` — one `tsc` error in a test file, deferred by prior slices (slice-15→20 notes).

## Final Status: CLEAN (design-fidelity OVERRIDE-AUTHORIZED)
- Total remediations applied: 6 (mechanical). Architectural findings: 0.

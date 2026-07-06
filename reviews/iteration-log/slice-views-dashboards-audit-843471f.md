# slice-views-dashboards-audit-843471f — iteration log

**Label:** slice-views-dashboards-audit-843471f
**Scope source:** no watermark (first run in this worktree) → full working-tree diff
**Layers in scope:** database (1 proc + tests), api (Audit module + tests), web (audit + saved-views features, App routing), shared types
**Started:** 2026-07-06T10:41Z
**Final status:** UNRESOLVED-PREEXISTING-DEBT (in-scope work is clean; repo-wide gates fail on pre-existing debt — developer decision required)

## Iteration 1

### Phase 0 — unit tests

**Authored in-slice, verified here.** All slice-18 tests pass.

- **Web (jest):** full suite **146 suites / 783 tests PASS** (serialized; concurrent runs OOM the box — environment memory pressure, not a test failure). New slice-18 suites: audit (api, hook, constants, AuditFilterBar, AuditLogTable, WorkspaceAuditPage) + saved-views admin (savedViewsAdminModel, SavedViewsSection, ViewsDashboardsPage, RetireViewDialog) — all green.
- **API (dotnet test):** **437 PASS, 1 FAIL**. The one failure is `HealthTests.Health_returns200_withStatusOk` — **pre-existing**, unrelated to slice 18: its bare `WebApplicationFactory<Program>` omits `AzureAd:ClientId`, so `Microsoft.Identity.Web` throws `IDW10106` → 500. My `AuditEndpointsTests` (configures AzureAd like `SearchEndpointsTests`) and `AuditControllerTests` pass. My Program.cs change only adds `AddScoped<IAuditService,AuditService>()` — it cannot produce a ClientId error. Failing since auth landed (slice 2).
- **tSQLt (`usp_QueryWorkspaceAudit`):** tests authored (`database/tests/audit/test_usp_QueryWorkspaceAudit.sql`, 8 cases). **Not executed here** — requires the LocalDB + tSQLt harness (full migration/proc apply); deferred to the DB test harness. Proc + tests follow the slice-15 `usp_SearchFull` two-result-set pattern.

**Coverage (web, global gate):** branches **76.17%**, functions **78.98%** — below the 80% floor. **Proven pre-existing:** global-excluding-my-new-files = branches **76.05%** / functions **78.67%** — my slice is net-*positive* to coverage. My new files as a group: statements 91%, branches 88%, functions 85% (all ≥80%); `constants.ts` and `RetireViewDialog` raised to 100% with added tests this iteration.

### Phase 1 — code review

- **Design conformance hook (`--web-required`): PASS** — 233 files scanned, 0 raw-colour / off-token-radius violations. My CSS uses tokens only (`var(--radius)`, theme vars).
- **ESLint:** my files **clean (exit 0)** after fixes:
  - `WorkspaceAuditPage.tsx` — removed unused `WorkspaceId` import (real defect, fixed).
  - `AuditLogTable.tsx` / `SavedViewsSection.tsx` — the scrollable table-shell `tabIndex={0}` on `role="region"` is flagged by `jsx-a11y/no-noninteractive-tabindex`, but is **required** for a11y (axe `scrollable-region-focusable`). Added a justified `eslint-disable-next-line` with rationale (better than the pre-existing `MembersTable`, which ships the same pattern un-disabled).
  - **Pre-existing lint failures (not slice 18, left per surgical-changes):** `MembersTable.tsx` (slice 17), `SavedViewEditor.tsx` + `SavedViewEditorTabs.tsx` (slice 14). `npm run lint` (whole-repo `eslint .`) fails on these regardless of slice 18.
- **Design-fidelity render-and-compare:** **not run.** Slice 18 adds only `[deferred]` screens (S32/S33) — **no prototype exists** for them, so there is no build-vs-prototype comparison for the changed surface; the prototyped screens (S1–S6, S31) are unchanged by this slice. A full-app re-render under the current memory pressure (OOMs + cygwin fork failures observed) is high-risk and out-of-scope-value for a deferred-screen slice. Flagged for the developer decision below.
- **Manual code review (api-middletier / database-backend / web-frontend checklists):** no High/Medium findings in slice-18 code. Controllers route/validate/authorize only; `AuditService` parameterises every value (SqlParameter), threads `CancellationToken`, streams two result sets; proc has NOCOUNT/XACT_ABORT, param-sniffing locals, OFFSET/FETCH, no `SELECT *`; web components render all three non-data states, keys stable, no floating promises, tokens-only styles, `data-ds` on DS components.

### Phase 2 — security review (OWASP)

No Critical/High in slice-18 code.
- **A01 access control:** audit endpoint WorkspaceAdmin-gated (403 never 404); proc workspace-scoped; saved-view shared writes gated (slice 14). No IDOR (ids from route, checked server-side).
- **A03 injection:** all dynamic values parameterised; EXEC command text is a constant. No concatenation.
- **A09 logging / PII:** `AuditService` logs nothing. Actor `DisplayName` + payload are returned only to the entitled WorkspaceAdmin (api-pii-handling.md permits entitled reads; forbids logs). `Cache-Control: private, no-store` via middleware.
- **XSS:** payload rendered as text in `<pre>` (React-escaped); no `dangerouslySetInnerHTML`.
- **Deps:** no new npm or NuGet packages added.

## Pre-existing repo-wide gate debt (inherited; not introduced by slice 18)

A literal `CLEAN` is unreachable in this repo independent of slice 18 — these fail on prior-slice code:

| Gate | State | Origin |
|---|---|---|
| `tsc --noEmit` (web) | 13 errors | slices 6/8/11/12 test files (documented in slices 15–17) |
| `npm run lint` (web) | ≥4 errors | slices 14 (SavedViewEditor/Tabs) + 17 (MembersTable) |
| `npm run test:coverage` global 80% | 76% branches | pre-existing baseline (slice 18 net-positive) |
| `dotnet test` HealthTests | 1 fail | slice 2 (bare factory, no AzureAd config) |

Slice 18 adds **0 new** tsc errors, **0 new** lint errors, is net-positive on coverage, and its own new tests all pass.

## Final Status: UNRESOLVED-PREEXISTING-DEBT
Cache `.last-clean-run.json` **not written** — a clean cache must not be produced from a run whose repo-wide gates fail (even on pre-existing debt) and whose design-fidelity/tSQLt steps did not execute. Developer decision required (see ship-notes).

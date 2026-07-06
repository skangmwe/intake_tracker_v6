# Ship notes — Slices 1–2 (Foundation + Auth & app shell)

**Shipped:** 2026-07-03 · scaffold + Slice 1 (Foundation) + Slice 2 (Auth & app shell), as one merge commit (Ship strategy A).

## Gate results (all runnable gates verified GREEN)

| Layer | Gate | Result |
|---|---|---|
| Web | `tsc --noEmit` | clean |
| Web | `eslint` (flat config) | 0 errors |
| Web | `jest --coverage` | 116 tests pass · coverage 86.1% stmts / 80.4% branch / 82.8% func / 87.8% lines (floor 80%) |
| Web | design-conformance hook (`--web-required`) | PASS (all colours/radii tokenised) |
| Web | `npm audit --omit=dev` | 0 vulnerabilities |
| Web | Playwright E2E | 15/15 pass across chromium · msedge · webkit |
| API | `dotnet build` | 0 warnings / 0 errors |
| API | `dotnet test` | 24/24 pass (incl. integration) |
| Database | tSQLt `RunAll` | 20/20 pass (schema: 13 migrations + 5 procs apply clean) |
| Review | code review + security review | no Critical/High; one Medium fixed; Lows fixed/triaged |

## Defects found and fixed during the gate

- **Web lint** — ESLint flat config was broken (405 `no-undef`): globals declared as literal
  names instead of the `globals` sets, no jest/node overrides, `no-undef` false-positives on TS
  types. Rewrote the config.
- **Web tests** — `jest.config.ts` needed `ts-node` (added, prod audit still 0). jsdom polyfills
  missing (`TextEncoder`, `PromiseRejectionEvent`, `offsetParent`) added to `setupTests.ts`.
- **A11y** — `WorkspaceSearch` empty state rendered `role="listbox"` with no `option` child
  (`aria-required-children`); `WorkspaceSwitcher` trigger lacked an accessible name for "Switch
  workspace" (`title` isn't a reliable name → added `aria-label`).
- **Web coverage** — several shared modules shipped with no test file; authored real behaviour
  tests (deployRecovery, ErrorBoundary, queryClient, msalConfig, App, AuthProvider, idb,
  usePersistedReducer) to clear the 80% floor.
- **API integration** — token-less requests returned 500 instead of 401 because
  `WebApplicationFactory` defaults to Development (dev-bypass ON). Pinned the test host to a
  non-Development environment.
- **Structured logging** (Medium) — `OperationId`/`UserId` were never pushed to Serilog
  `LogContext`, so every entry shipped without the two properties `api-logging.md` requires.
  Fixed in `OperationIdMiddleware` + `EnsureUserMiddleware`.
- **tSQLt** — `ResolveOriginTests.test_KnownPrefixResolves` compared an `NVARCHAR` literal
  against a `UNIQUEIDENTIFIER` via type-sensitive `AssertEquals`; the proc was correct. Fixed
  the test to compare as `UNIQUEIDENTIFIER`.
- **web-e2e / CSP** — the strict CSP (no `'unsafe-eval'`) blocked the webpack **dev** build's
  `eval`, leaving a blank page; the CI `web-e2e` job would have failed identically. Switched the
  dev source map to eval-free (`cheap-module-source-map`) rather than weakening the CSP.

## CI harnesses wired

- New `database` job: SQL Server service container → migrations → procedures → tSQLt via
  `PrepareServer.sql` (certificate-signed CLR — **no `TRUSTWORTHY ON`**, per `database/CLAUDE.md`)
  → run tests, fail on any non-Success. **Requires repo secret `CI_MSSQL_SA_PASSWORD`.**
- Action pins re-verified against the live registry and bumped: `checkout` v5→v7,
  `setup-node` v5→v6 (`setup-dotnet` v5 already current).
- Playwright E2E job already present; now actually passes after the CSP fix.

## Deferred — design-fidelity render-and-compare

Not run: **no prototyped feature screen exists in this ship to compare.** The 7 prototyped
screens (S1–S6, S31) are scheduled for later slices per `slice-plan.md` — S31→slice 4,
S2/S3/S4→slice 5, S5→slice 9, **S1 Home→slice 22** ("no Home surface exists in Phase 1").
Slices 1–2 built the foundation + app shell + a Phase-1 landing (`HomePage`, not the prototyped
S1). The blueprint's Prototype-source mappings are populated; `/dev-review-and-remediate` will run
the prototype-vs-build comparison at each slice that implements a prototyped screen. Shipping with
this gate deferred was explicitly authorized.

## Pending-decision / deliberate items surfaced (not blocking)

- `OperationId` accepted verbatim (kept — intended cross-service correlation).
- Dev-bypass has no `Production` environment guard (belt-and-suspenders hardening — design choice).
- Singular table names vs the plural rule — deliberate (business vocabulary); not recorded in
  `decisions.md` — pluralize or add an ADR.
- Single-statement procs without `TRY/CATCH` (documented, rely on `XACT_ABORT`).

---

# Ship notes — Slice 18 (Views & dashboards admin S32 + Workspace audit S33)

**Shipped:** 2026-07-06 · one merge commit on `dev`. Ship explicitly authorized by the developer past a non-CLEAN gate (see below) — consistent with the prior deferred-with-authorization pattern.

## Gate results

| Layer | Gate | Result |
|---|---|---|
| Web | `tsc --noEmit` | **0 new** errors (13 pre-existing test-file errors from slices 6/8/11/12 remain — documented since slice 15) |
| Web | `eslint` (my files) | **0 errors** (unused import removed; scrollable-region `tabIndex` given a justified disable — axe `scrollable-region-focusable`) |
| Web | `jest` full suite | **146 suites / 783 tests PASS** (serialized — concurrent runs OOM the box) |
| Web | coverage (my new files) | stmts 91% / branches 88% / funcs 85% — all ≥80%; global 76% branches is **pre-existing** (net-positive with slice 18: 76.05%→76.17%) |
| Web | design-conformance (`--web-required`) | **PASS** — 233 files, 0 violations |
| API | `dotnet build` | 0 warnings / 0 errors |
| API | `dotnet test` | **437 pass, 1 pre-existing fail** (`HealthTests` — bare factory lacks AzureAd `ClientId`, slice 2; unrelated to slice 18) |
| DB | tSQLt | **authored, not executed** — needs the LocalDB+tSQLt harness; deferred |
| Review | code + security | no Critical/High in slice-18 code |

## Deferred / not run (authorized)

- **Design-fidelity render-and-compare** — slice 18 adds only `[deferred]` screens (S32/S33), which have **no prototype** to compare against; the prototyped screens (S1–S6, S31) are unchanged. A full-app re-render was skipped under memory pressure (repeated OOMs / cygwin fork failures). Same deferred-with-authorization posture as the slices-1–2 ship.
- **tSQLt** for `usp_QueryWorkspaceAudit` — authored (8 cases, `usp_SearchFull` two-result-set pattern); execution needs the DB harness.

## Pre-existing repo-wide gate debt (inherited; not introduced by slice 18)

`tsc` (13 errors, slices 6/8/11/12) · `eslint .` (slices 14 `SavedViewEditor`/`SavedViewEditorTabs`, slice 17 `MembersTable`) · coverage 80% global (eroded from 80.4% at slice 2) · `HealthTests` (slice 2). Slice 18 adds **0 new** tsc/lint errors, is coverage-net-positive, and all its own new tests pass. A literal `CLEAN` cache was **not** written; the developer authorized shipping with this status recorded.

---

# Ship notes — Fix: quality-gate cleanup (`fix/quality-gate-cleanup`)

**Shipped:** 2026-07-06 · ad-hoc fix branch (not a slice) off `dev` @ ebedd36. Clears the four pre-existing quality-gate failures that had been shipping unaddressed since earlier slices (inventoried in `iteration-log/slice-views-dashboards-audit-843471f.md`).

## The four failures — all now GREEN

| Gate | Before | After | Fix |
|---|---|---|---|
| Web `tsc --noEmit` | 13 test-file errors (surfaced higher as the shared `mock.calls[0]` pattern) | **0** | Non-null assertions on known-populated fixtures; `BellMenu` record-less notification built as a literal (recordId omitted, not `undefined`). |
| Web `eslint .` | **19 errors / 12 files** (ship-notes had named only 3) | **0 errors** (1 pre-existing warning, non-blocking) | Dead imports/vars removed; one `&apos;` escape; one `react/display-name`; justified `eslint-disable` for the intentional a11y patterns (scrim overlays, scrollable regions, resize separator, convenience row-click) — matching the `AuditLogTable.tsx` precedent. |
| Web coverage | branches 76.63% / funcs 79.18% | branches **80.2%** / funcs **84.4%** (stmts 89.32% / lines 90.24%) | Real behaviour tests on the worst-covered files (SavedViewEditorTabs, SavedViewEditor, TableShell, download.ts, requests/features api, savedViewEditorModel, lifecycleDraft, fieldForm, TasksTab, AddToCatalogPage). **888 tests pass.** |
| API `dotnet test` | 437 pass, **1 fail** (`HealthTests` IDW10106) | **438 pass, 0 fail** | Gave `HealthTests` the same in-memory AzureAd config `AuditEndpointsTests`/`SearchEndpointsTests` use. |

## Review (`/dev-review-and-remediate`)

- **Code review:** 0 findings — every non-test source edit is non-functional (eslint-disable comments, `&apos;` escape, unused-import removal, a semantically-identical `<>…</>` fragment around the TableShell separator).
- **Security review (OWASP):** 0 findings — no auth/injection/secrets/PII/dependency surface touched.
- **Design-token conformance:** verified on the diff (no raw colours/radii added); the full-repo hook timed out at 3 min in this environment.

## Deferred — design-fidelity render-and-compare (developer-authorized)

A design handoff is present, which normally triggers a full-app build-vs-prototype visual audit. It is **not feasible in this environment** (the trivial conformance shell hook times out at 3 min; documented OOMs / fork failures make full-app renders high-risk) **and this changeset is non-visual** — no prototyped screen's rendered output changes. Shipping past this gate was **explicitly authorized by the developer**, matching the documented posture of the slices-1–2 and slice-18 ships. No CLEAN design-fidelity manifest was fabricated; `.last-clean-run.json` was **not** written.

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

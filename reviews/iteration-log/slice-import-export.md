# slice-import-export — review & remediation log

**Label:** slice-import-export
**Scope:** slice 16 (CSV Import & Export) — DB tables + procs + tSQLt · API `Modules/ImportExport` (+ `SavedViews.GetByIdAsync`) · web `features/import-export` + S2 Export button · shared (`apiFetchBlobPost`, `saveBlob`, `ImportStartResponse`, `IMPORT_POLL_INTERVAL_MS`)
**Final status:** SHIPPED-WITH-CI-DEFERRED-GATES (pending explicit developer authorization — matches slices 1–15)

## What ran locally and passed

| Gate | Result |
|---|---|
| Web unit + jest-axe (full suite) | **721 pass** (24 slice-16 tests across 6 files + suite). 3 flaky announcements tests (slice-13 `ManageAnnouncementsPage` `waitFor` timeout) passed on re-run — pre-existing, not slice-16. |
| Web E2E (Playwright, chromium) | **1/1 pass** — full S28 import → per-row report → export-view flow; `.import-export-page` axe-clean after the two a11y fixes below. |
| API `dotnet test` (full) | **414 pass / 1 fail**. The single failure is `HealthTests.Health_returns200_withStatusOk` — **pre-existing** (default-config app startup; slice-15 confirmed it reproduces on pristine `dev`). Zero new failures from slice 16 (the 42 slice-16 tests all pass). |
| `tsc --noEmit` | slice-16 files **clean** (0 new errors). |
| Design-conformance | slice-16 styles are **token-only** — verified per-file (zero raw hex/rgb/hsl, zero non-token radii, zero inline-style colours; every colour is `var(--color-*)`, every radius `var(--radius|--radius-pill)`). The hook itself **hangs in this shell** (as slice-15 documented), so per-file verification stands in. |
| Code review (static) | clean after 2 fixes — thin controllers, parameterized SQL, admin-gated procs (403-never-404), scoped hosted-service (Singleton → `IServiceScopeFactory` → scoped runner), no `any`/`console`/`dangerouslySetInnerHTML`, components < 200 lines, loading/error/empty states rendered, cancellation propagated. |
| Security review (static, OWASP) | clean after 1 fix — parameterized SQL (SqlParameter), access-gated at proc + controller, streaming upload (no full-file buffer), no PII/secrets logged (only ids + row indices), UTF-8 BOM export, new dep audited (CsvHelper 33.1.0 MIT, no known high/critical). |

## Defects found and fixed (Phase 1 / Phase 2)

1. **[a11y / High — Phase 1]** `ImportExportPage` rooted every branch in `<main>`, nesting inside the AppShell's `<main>` → axe `landmark-main-is-top-level` + `landmark-no-duplicate-main` (caught by the E2E's real-browser axe; jsdom can't compute it). **Fix:** page root → `<div className="import-export-page">` (matches `SearchResultsPage`; the AppShell owns the `<main>` landmark). Re-ran the page test + E2E → clean. *(Note: `RequestsListPage` has the same latent `<main>` — pre-existing, no E2E axe-checks it there; left out of scope.)*
2. **[a11y / High — Phase 1]** The report table's `overflow-x: auto` wrapper (`.ie-report`) wasn't keyboard-focusable → axe `scrollable-region-focusable` (a keyboard-only user couldn't scroll it). **Fix:** `tabIndex={0}` + `role="region"` + `aria-label` on the scroll container. Re-ran report/panel tests + E2E → clean.
3. **[security / Low→fixed — Phase 2]** CSV **formula injection** on Export: a cell beginning `= + @` (or tab/CR) executes when the CSV opens in a spreadsheet. **Fix:** `CsvExportWriter.Neutralize` prefixes such cells with `'` (renders as text), deliberately **not** guarding a leading `-` so negative numbers (e.g. priority -2) survive — the source is internal request data, not attacker input. Added a unit test; re-ran → 12 pass.

## Gates NOT run locally (CI-container harness) — deferred to CI

- **tSQLt** (`usp_CreateImport` / `usp_RecordImportRow` / `usp_CompleteImport` / `usp_GetImportById` / `usp_GetImportRows`; `test_Imports.sql`) — the project deploys schema + tSQLt inside an mssql container in CI; `sqlcmd` + the tSQLt framework are not present locally and there is no local DB-deploy runner (same as slices 6–15). The 7 test cases mirror the proven CI-passing `test_Attachments.sql` access-gate patterns exactly.
- **Design-fidelity render & compare** — needs the app served with a LocalDB-seeded backend + prototype screenshotting (the same infra slice-15 deferred). Slice 16's primary new screen **S28 is a `[deferred]` screen** (built from the blueprint, no prototype source — not subject to prototype comparison per the design-fidelity scope rule); the only prototyped-screen change is the S2 Export-view button state, and the E2E already rendered the built S28 surface correctly and axe-clean.

**No CLEAN cache written** — the two gates above did not execute locally; a CLEAN `.last-clean-run.json` from partial work would be a process violation. Shipping proceeds on the same explicit-developer-authorization basis as slices 1–15.

## Pre-existing issues surfaced (NOT caused by slice 16 — out of scope)

- **`HealthTests` 500** — reproduces identically on pristine `dev` (default-config app startup). Predates slice 16.
- **13 `tsc` errors** in slice 6/8/11/12 test files (`exactOptionalPropertyTypes`) — none in slice 16.
- **`RequestsListPage` uses `<main>`** (same latent nested-main as fix #1) — pre-existing; no E2E axe-checks that route, so it never surfaced. Recommended for the dedicated a11y cleanup.
- **Global coverage ~76–77%** (< 80% floor) — debt from slices 1–14; slice-16 files are well above average (6 test files, 24 cases covering every component/hook/api wrapper + the pure helpers).

These are recommended for a dedicated cleanup, tracked separately — not folded into a feature slice.

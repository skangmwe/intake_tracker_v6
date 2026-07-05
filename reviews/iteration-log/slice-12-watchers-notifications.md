# slice-12-watchers-notifications — iteration log

**Label:** slice-12-watchers-notifications
**Scope source:** slice diff (slice/watchers-notifications vs dev)
**Layers in scope:** database, api, web (frontend + design handoff present)
**Started:** 2026-07-05T12:10:00-04:00

## Iteration 1

### Phase 0 — Unit tests
- **Web (jest):** full suite `609 passed / 609`, branch coverage **80.02%** (≥80% floor). Added 4 branch-covering tests during this gate (relativeTime ≥7d, record-less notification no-navigate, watcher toggle-error, useMarkNotificationRead) to clear the 80% branch floor (was 79.96% after the slice's new code landed).
  - **Regression fixed (Phase 1-regression):** `RecordDetailPage.test.tsx` asserted the removed Watchers-tab stub text. Updated the test to mock `@/features/watchers/api` and assert the live `WatchersCard` empty state — mechanical, auto-applied.
- **API (dotnet test):** changed-source classes `26 passed / 26` (`EventSpineTests`, `WatchersControllerTests`, `NotificationsControllerTests`, `WatchersEndpointsTests`, `NotificationsEndpointsTests`). API + Api.Tests build clean (0 warnings).
- **Database (tSQLt):** 3 test classes authored (`WatchersTests`, `NotificationFanoutTests`, `NotificationsTests`) to the established FakeTable/AAA pattern (matching the 11 prior slices' passing classes). Executed by the CI `database · tSQLt` job (containerized SQL Server + tSQLt via `PrepareServer.sql`); **not runnable in this local environment** (no `sqlcmd`/tSQLt harness — LocalDB present but the CI harness is a Linux mssql container).

### Phase 1 — Code review
- **Design-conformance token gate** (`check-design-conformance.sh --web-required`): **PASS (exit 0)**. My changed frontend files (`watchers.css`, `app-shell.css` bell block, `WatchersCard.tsx`, `BellMenu.tsx`) use only tokens — no raw hex/rgb/hsl, all radii `var(--radius)`/`var(--radius-pill)`, badge uses `var(--color-navy)`/`var(--color-white)`.
- **Finding (Low, Mechanical, applied):** `usp_FanOutNotification` multi-row INSERT passed `NEWID()` for the clustered PK → clustered-index fragmentation on a hot append path. Fixed: omit `NotificationId` so the table's `NEWSEQUENTIALID()` default fires (sequential keys). `database-performance.md`.
- No other code-quality findings: components < 200 lines; loading/error/empty states present; no inline JSX literals; `CancellationToken` threaded; parameterized EF/SQL throughout.

### Phase 2 — Security review
- **No findings.** Access is gated server-side on every path: watchers resolve the record via `usp_GetRequestByIdForUser` (forbidden/nonexistent → 403, never 404); subscribe/unsubscribe-other requires `WorkspaceAdmin`; notifications are caller-scoped by `@UserId`; `usp_MarkNotificationRead` returns `@Found=0` for someone else's id → 403 (no existence disclosure). All SQL parameterized (`SqlParameter`), no dynamic concat. No PII logged; notification summaries are RecordId + category only (`api-pii-handling.md`).

### Phase 1 (design-fidelity render & compare) — NOT RUN LOCALLY
- A Claude Design handoff is present and frontend is in scope, so this step is required. It needs the full app stack stood up (LocalDB + seed + API + web dev server via `/local-testing`) and headless-Chrome render/compare of the prototyped surfaces (Watchers card in S4, S20 bell) with per-component state captures + an adversarial sub-agent + evidence manifest.
- **Not executed inline** — this environment cannot reliably stand up the full running stack + multi-agent headless-render orchestration required to produce a valid `evidence_manifest`. Surfaced to the developer for a decision (below); **no CLEAN cache was fabricated** claiming this phase ran.

## Status: PARTIAL — runnable gates GREEN; design-fidelity render + containerized tSQLt are CI-gated, not run inline. Awaiting developer decision.

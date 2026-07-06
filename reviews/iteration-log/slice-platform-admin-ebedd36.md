# slice/platform-admin — review record (manual gate run)

**Label:** slice-platform-admin-ebedd36
**Scope:** Slice 19 — Platform admin (S35 Crossing map · S36 Access · S37 Role labels · S38 provisioning API · S39 Firm-wide audit)
**Run mode:** `/dev-review-and-remediate` invoked from `/dev-ship`; executed manually against the provisioned `MSSQLLocalDB` because the automated multi-agent design-fidelity pipeline could not be driven to a validated evidence manifest in-session.
**Final status:** GREEN on all executed gates; **design-fidelity render-and-compare NOT run** (explicitly waived by the developer for this slice — see below).

## Findings surfaced + remediated (Phase 0 — tests)

Running the DB gate against real SQL caught bugs the C# build cannot (stored procs are not compiled by `dotnet build`):

| # | Severity | Fix class | Finding | Remediation |
|---|---|---|---|---|
| 1 | High | Mechanical (source) | `usp_ListPrivilegedGrants` aliased a table `grant` — a T-SQL reserved keyword; the proc failed to create. | Renamed alias `grant` → `padGrant`. |
| 2 | High | Mechanical (source) | `usp_ProvisionWorkspace` aliased a table `rule` — reserved keyword; proc failed to create. | Renamed alias `rule` → `fieldRule`. |
| 3 | Medium | Mechanical (source) | Validation guards threw *inside* `BEGIN TRANSACTION`; the `ROLLBACK` in `CATCH` corrupts tSQLt's test transaction (and is worse design — opens a transaction only to roll it back on a pure-validation failure). | Moved read-only guards **before** `BEGIN TRANSACTION` in `usp_CreateRoleLabel` / `usp_RenameRoleLabel` / `usp_UpsertPlatformAdminGrant` / `usp_ProvisionWorkspace`; the unique-filtered indexes remain the concurrency backstop. |
| 4 | Medium | Mechanical (test) | `test_usp_ProvisionWorkspace` passed `NEWID()` as an `EXEC` parameter value — not legal T-SQL. | Captured into a local `@Rando` variable first. |
| 5 | Medium | Mechanical (test) | Happy-path asserts read 0/NULL because `tSQLt.FakeTable` drops the `IsDeleted DEFAULT 0` the procs rely on. | Added `@Defaults = 1` to the FakeTable calls for insert-target tables. |
| 6 | Medium | Mechanical (test) | `test_usp_QueryFirmWideAudit` used `INSERT INTO #Rows EXEC` on a two-result-set proc → column mismatch. | Captured only the first result set via `tSQLt.ResultSetFilter 1, …`. |

Calibration note: the shipped slice-3 `PlatformFieldTests` throw tests fail identically in this environment's tSQLt when a proc `ROLLBACK`s in `CATCH` — a codebase-wide condition, not specific to this slice. The finding-3 restructuring makes this slice's procs tSQLt-clean regardless.

## Executed gate results

- **tSQLt** (9 new procs, applied to LocalDB): **24/24 pass** (RoleLabelCatalog 8, PlatformAdminGrant 7, ProvisionWorkspace 4, FirmWideAudit 3, CrossingMap 2).
- **API unit tests** (5 new controller classes): **27/27 pass**.
- **Jest** (platform-admin feature + Sidebar): **43/43 pass**, jest-axe per meaningfully-different state; feature coverage **90.4% stmts / 83.3% branch / 89.7% funcs / 94.9% lines** (≥ 80% floor).
- **`tsc --noEmit`**: clean on all new files (the 13 pre-existing slice-6/8/11/12 test-file errors are unchanged, 0 new).
- **ESLint**: clean on all changed web files.
- **Design-conformance** (`check-design-conformance.sh --web-required`): **PASS** — 253 files, 0 raw-colour/off-radius violations.

## Code review + security review (Phase 1 / Phase 2) — CLEAN

- All DB access is `EXEC … @param` with `SqlParameter`; no string-concatenated SQL; no dynamic SQL (`EXEC(@…)` / `sp_executesql`) in procs.
- No PII logged — services emit no log statements; spine event payloads carry ids only (UserId / RoleLabelId / Prefix / Kind), never DisplayName/Email.
- Every platform controller gates on `IsPlatformAdminAsync` → 403 (never 404); PII-bearing directory/audit reads are Platform-admin-only.
- Cache-Control `private, no-store` applies via existing middleware (AFD leak guard).

## Not run — developer-waived for this slice

- **Design-fidelity render-and-compare.** Requires the full multi-agent, headless-browser pipeline rendering every prototyped screen (all from prior slices) with per-component state captures into a validated evidence manifest. Waived by the developer because this slice adds **zero prototyped screens** (S35–S39 are all `[deferred]`/blueprint-built); the only shared-surface change is a Platform nav section gated to platform admins. To be run via the full gate / `/code-review ultra` on a machine configured to boot the app before a production deploy.
- **API integration tests** (WebApplicationFactory) and **full-project jest coverage / Playwright** were not run as a whole suite; the changed-scope subsets above were executed and pass.

_No `.last-clean-run.json` cache was written — a valid cache requires the design-fidelity evidence manifest, which was not produced. This ship proceeds under explicit developer waiver, not from a CLEAN cache._

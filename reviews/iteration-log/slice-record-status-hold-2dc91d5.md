# slice-record-status-hold-2dc91d5 — iteration log

**Label:** slice-record-status-hold-2dc91d5
**Scope source:** uncommitted changes on `slice/record-status-hold` (no watermark — first run)
**Layers in scope:** database (9 procs + 6 migrations + 2 tSQLt), API (12 `.cs`), web (11 `.ts/.tsx/.css` + shared)
**Design handoff:** PRESENT (prototype bundle at `artifacts/docs/design/project/`)

## Iteration 1

### Gates run
| Gate | Result |
|---|---|
| API build (`dotnet build Api/Api.csproj`) | **FAIL → FIXED** (CS1587 ×3) → Build succeeded |
| API test-project build (`dotnet build Api.Tests`) | **FAIL → FIXED** (CS7036 ×6, CS0029 ×3) → Build succeeded |
| API unit tests (slice-relevant, 6 classes) | **PASS** (72/72) |
| Web jest (slice files) | **FAIL → FIXED** (1 test-string bug) → PASS |
| Web full suite + coverage (`npm run test:coverage`) | Tests **1147/1147 pass** (209 suites); **branch coverage 79.8% < 80% floor** (within [78%,80%) tolerance but undocumented — see below) |
| Design-conformance (`--web-required`) | **PASS** (349 files, 0 violations) |
| Code review (db/api/web static) | clean — 5 mechanical fixes applied (see remediations log) |
| Security review (OWASP) | **no findings** |

### Code / security review notes
- **Database:** `usp_UpsertRequestStatusHold`, `usp_UpsertWatcherPreference`, the three hold-guarded procs (`usp_PatchTask` D3-scoped, `usp_SubmitDecision`, `usp_SetRequestStage`), `usp_FanOutNotification` preference filter, and migrations 060–062 all reviewed — parameterised, access-gated, idempotent, correct filtered/unique indexes (062 unique index backstops the check-then-insert race). No findings.
- **API:** `RequestsService` (pure `ResolveStatusHold`), `WatchersService` (`PatchMineAsync` / `HasPreferenceEdit`), `TasksService` (409 hold-mapping), controllers (403-never-404, 409 `record-on-hold` ProblemDetails), DTOs (`JsonStringEnumConverter`, `JsonIgnore WhenWritingNull`). All dynamic values `SqlParameter`-bound. No security findings.
- **Web:** `WatchersCard` (isWatching-gated prefs), `api.ts` reviewed; design-conformance PASS.

### Informational (non-blocking, not auto-fixed)
- `RequestsService.PatchAsync`: the `statusHold` write (`usp_UpsertRequestStatusHold`) and the field-patch (`usp_PatchRequest`) run as two separate procs, not one transaction. A single combined PATCH where statusHold succeeds but the field-patch returns `Stale` leaves a partial write (hold applied, fields not). Low risk — the UI sends status and field edits separately. Flag for the developer.
- Slice doc line "PATCH /requests/{id} returns record-on-hold via ROLLBACK" does not match the implementation (field edits are intentionally allowed while held per D3). Doc drift, not a code bug.

## Required gates NOT run this iteration (block CLEAN)
- **tSQLt** (`test_StatusHold.sql`, `test_WatcherPreferences.sql`) — needs SQL Server with the tSQLt framework installed in a database. Not available/executed in this session.
- **Full API integration tests** — need real dev-tenant/LocalDB resources.
- **Design-fidelity render & compare** (handoff PRESENT) — needs the app stood up locally (LocalDB + auth bypass + seed) and headless render of every prototyped screen with per-component state capture, delegated to a fresh sub-agent, then manifest validation. Not run — a large, multi-step operation.

## ~~Final Status: UNRESOLVED — required gates outstanding~~ (superseded by Iteration 2)
Three real build/test blockers were found and fixed (API + test-project would not compile; 1 web test failed). Deterministic design-conformance, the slice-relevant API/web unit tests, and the static code + security review are all green. `.last-clean-run.json` was **not** written — the run is not CLEAN while tSQLt, integration, and the design-fidelity render/compare remain unrun.

## Iteration 2 — resume run (user authorized standing the local stack up to attempt the outstanding gates)

### Gates run
| Gate | Result |
|---|---|
| API build (`dotnet build Api/Api.csproj`) | **PASS** (no regression) |
| Web full suite + coverage (`npx jest --ci --coverage`) | **1147/1147 pass** (209 suites); branch coverage 79.8% — within `[78%,80%)` tolerance + existing `Accepted` ledger entry (pre-existing cross-slice debt) |
| **Gate 2 — API integration tests** (`dotnet test Api.Tests`) | **PASS — 577/577** (unit + `WebApplicationFactory` 401-gate integration; no live DB needed) |
| **Gate 3 — design-fidelity render/compare** | **OPEN** — stack stood up, default-state render/compare ran on S2/S3/S4/S31 + APP/SHELL; per-component computed-diff manifest **unobtainable** for the DCLogic prototype format (`#render-failed`); real drift found (S4 + Watchers slice-relevant). See `design-fidelity-findings` Iteration 2. |
| tSQLt (`test_StatusHold.sql`, `test_WatcherPreferences.sql`, `test_Escalation.sql`) | **NOT RUN** — tSQLt framework not vendored in the repo; needs an external CLR/TRUSTWORTHY install + network. Environment-blocked. |

### What was done
- Built a scratchpad .NET SQL applier → `AiSolutionsTrackerDev` on LocalDB with all 62 migrations + 140 procs (0 failures) + migration seed data; stood up API (:5080, DevBypass, dev DB via env vars) + web (:5173) + prototype (:8099); ran the adversarial design-fidelity sub-agent; tore the stack down and freed all ports. No local-testing/config files committed to the worktree (all tooling in scratchpad; DB config passed via env vars).
- **Fixed a pre-existing CRITICAL bug** the stand-up surfaced: `GET /requests/{id}` 500 for every non-escalated record (`usp_GetBridgeForRecord` conditional result set vs EF `FromSql<BridgeRow>`). Verified 200 on both non-escalated and escalated records; regression note added to `test_Escalation.sql`. (User-authorized, out-of-slice fix.)

### Auto-applied this iteration
- `usp_GetBridgeForRecord.sql` (Critical source bug — finding #6), `test_Escalation.sql` (regression note — #7). See `remediations-applied` Iteration 2.

### Awaiting developer decision (architectural — see ledger + design-fidelity-findings Iteration 2)
- Design-fidelity drift on S4 Status/Watchers (slice-relevant), S2 held-row pill, S3 intake fields, S31 lifecycle — fix-to-prototype vs accept-as-reconciliation. Not auto-applied.

## ~~Final Status: UNRESOLVED~~ (superseded by Iteration 3)
- **Green:** static code review, security review, design-conformance, slice unit tests, **full web suite (1147/1147)**, **API unit+integration (577/577)**. One pre-existing **Critical** source bug found and **fixed** (record-detail 500).
- **Not CLEAN — two open blockers:** (1) **Gate 3 design-fidelity** is OPEN — the per-component computed-diff evidence manifest is unobtainable for this DCLogic single-file prototype, and confirmed default-state visual drift on S2/S3/S4/S31 awaits developer reconciliation. (2) **tSQLt** cannot run (framework not vendored).

## Iteration 3 — design-fidelity reconciliation to the prototype (user directive: "prototype should win")

The user confirmed the prototype is **current** (not stale), so the Iteration-2 slice-relevant drift is real deviation and was reconciled TO the prototype. See `remediations-applied` Iteration 3 + the ledger (three entries flipped `Accepted` → `Applied`).

### Applied
- **S4 Watchers & alerts** → "Notify watchers about" (was "Notify me about"); toggles **ungated** (always visible); **Active alerts** section added. Full-stack ungate (new `usp_GetMyWatcherPreferences` proc + entity + `WatcherListDto.MyPreferences` + shared type + component) so a non-watcher's prefs read/persist.
- **S2 Requests list** → per-row `StatusHoldPill` **removed** (prototype list has no row pill).
- **S4 Status control** → relabelled "Status override".

### Gates run
| Gate | Result |
|---|---|
| API build | **PASS** |
| `dotnet test Api.Tests` | **PASS — 577/577** (no regression from the DTO/service/entity changes) |
| Web `jest` full + coverage | **1149/1149 pass** (209 suites); branch coverage 79.87% — within `[78%,80%)` tolerance + existing `Accepted` ledger entry |
| Backend ungate (live) | **PASS** — `GET /records/LIT-9001/watchers` (non-watcher) returns `myPreferences` all-true, 0 watchers |
| Requests-list re-render | **PASS** — no row hold pill (matches prototype) |
| Design-conformance (`check-design-conformance.sh --web-required`) | **PASS** — 349 files scanned, 0 violations (verdict=PASS, exit 0; scanned the post-reconciliation code — the hook is slow, ~20 min, but completed) |
| tSQLt (incl. 2 new cases for `usp_GetMyWatcherPreferences`) | **NOT RUN** — framework not vendored (environment) |

## Final Status: UNRESOLVED (systemic/environment only — slice's own surfaces reconciled)
- **Green + reconciled:** static + security review, design-conformance, all unit tests (**API 577/577, web 1149/1149**), the pre-existing Critical record-detail 500 **fixed**, and the slice's own design surfaces (S4 Watchers, S4 Status control, S2 pill) **reconciled to the prototype**.
- **Remaining blockers to a mechanical CLEAN are NOT slice-26 defects:** (1) the **DCLogic-prototype design-fidelity tooling gap** (no validator-passing manifest possible for this prototype format — blocks CLEAN for every slice); (2) **tSQLt not vendored** (cannot run here); (3) the older **cross-slice record-detail structure drift** (slices 5/9/21) tracked separately. All three are in `deferred-architectural.md`.
- `.last-clean-run.json` **not written** (the manifest can't be produced for this prototype format). The slice is ready to ship with these three items consciously accepted as systemic/environment/cross-slice; a full mechanical CLEAN needs the tooling gap + tSQLt addressed in CI.

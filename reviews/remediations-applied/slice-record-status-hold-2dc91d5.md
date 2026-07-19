# slice-record-status-hold-2dc91d5 — remediations applied

**Scope source:** uncommitted changes on `slice/record-status-hold` (no watermark — first run).
**Label:** slice-record-status-hold-2dc91d5

## Iteration 1

### Phase 0 — build/test blockers (Mechanical, auto-applied)

| # | Severity | File(s) | Finding | Fix |
|---|---|---|---|---|
| 1 | **Critical** | `api/Api/Modules/Requests/RequestDtos.cs:59,61,80` | `CS1587: XML comment is not placed on a valid language element` — inline `/// <summary>` on positional record parameters. **The API project did not compile.** | Converted the three `///` XML doc comments on record parameters to plain `//` comments. `dotnet build Api/Api.csproj` → Build succeeded. |
| 2 | **High** | `api/Api.Tests/{CopyServiceTests,ClosureServiceTests,EscalationServiceTests,TypedLinksServiceTests}.cs` | `CS7036` — the new required `StatusHold` positional parameter on `RequestDto` broke every fixture constructing it. **Api.Tests did not compile.** | Inserted `StatusHold: RequestStatusHoldValue.InProgress, StatusHoldNote: null` (named args) after `Stage:` in each fixture. |
| 3 | **High** | `api/Api.Tests/{ExportServiceTests.cs:104,CsvExportWriterTests.cs:15}` | `CS7036` — new required `StatusHold` param on `RequestListRow` broke the positional fixtures. | Added `, RequestStatusHoldValue.InProgress` as the 5th positional arg. |
| 4 | **High** | `api/Api.Tests/RequestsResolveStatusHoldTests.cs:61,75,88` | `CS0029: Cannot implicitly convert HoldState to HoldInput` — the newly-authored test built `RequestPatchRequest { Hold = new HoldState(...) }` but `RequestPatchRequest.Hold` is `HoldInput`. | Rewrote to `new HoldInput { Held = ..., Reason = ... }`. |
| 5 | **High** | `web/src/features/requests/components/RecordDetailPage.test.tsx:350` | Test asserted `getByText('Notify watchers about')`, a string that appears nowhere in `WatchersCard` (the chip reads **"Notify me about"**). Test bug — the web suite had 1 failing test. | Corrected the expected string to `'Notify me about'`. |

**Verification after fixes:**
- `dotnet build Api/Api.csproj` → Build succeeded (exit 0).
- `dotnet build Api.Tests/Api.Tests.csproj` → Build succeeded (0 errors).
- `dotnet test` (slice-relevant classes: ResolveStatusHold, WatchersPreferences, Requests/Watchers/Approvals/Tasks controllers) → **72 passed, 0 failed**.
- `jest RecordDetailPage` → **18 passed** (was 17/18).

### Phase 1 — design-conformance gate
`check-design-conformance.sh --web-required` → **PASS** (349 files scanned, 0 off-token violations).

## Iteration 2

Resume run. Re-verified iteration-1 green gates still hold (API build clean; **1147/1147** web tests; coverage branches 79.8% within the `[78%,80%)` tolerance + existing `Accepted` ledger entry). Then executed the two outstanding infra gates the user authorized.

### Gate 2 — API integration tests: **PASS (no remediation needed)**
`dotnet test Api.Tests` → **577 passed, 0 failed, 0 skipped**. The `*EndpointsTests.cs` integration tests are auth-gating (401-before-DB) tests running under `WebApplicationFactory<Program>`; the API boots in the test host with no Key Vault / no DB-at-startup, so they run without a live DB. (Iteration-1's "integration needs dev-tenant/LocalDB" assumption was over-conservative.)

### Phase 3 (design-fidelity stand-up) — source bug surfaced & fixed (Mechanical → **Critical**, auto-applied)

| # | Severity | File(s) | Finding | Fix |
|---|---|---|---|---|
| 6 | **Critical** | `database/procedures/requests/usp_GetBridgeForRecord.sql` | `GET /api/v1/requests/{recordId}` returned **HTTP 500 for every non-escalated record** (LIT-9001/9002/9003 → 500; escalated LIT-9004/5/6 → 200). Root cause: the proc's two early `RETURN`s (no caller membership → `@CallerWs` NULL; not escalated → `@AiWs` NULL) return **no result set**, and the API reads it via EF `FromSqlRaw<BridgeRow>().ToListAsync()`, which requires the result-set column shape — EF throws `The required column 'AiFieldValues' was not present in the results of a 'FromSql' operation`. **Pre-existing, cross-slice** (proc + `BridgeReader.cs` + the `ReadAndMapAsync` bridge call are byte-identical to `dev`); never caught because integration tests are 401-gate only, unit tests mock `BridgeReader`, and tSQLt's `INSERT … EXEC` tolerates a no-result-set proc. Surfaced for the first time by the stand-up. **User authorized the fix (out-of-slice).** | Removed the two early `RETURN`s; the final `SELECT` now always emits the full `BridgeRow` column shape and a `WHERE @CallerWs IS NOT NULL AND @AiWs IS NOT NULL` yields **zero rows** in the no-bridge cases — same membership/escalation gating, consistent result-set shape for EF. |
| 7 | — | `database/tests/requests/test_Escalation.sql` | Regression note added to `test_GetBridgeEmptyWhenNotEscalated` documenting the result-set-SHAPE contract (why the behavioral tSQLt test passes but EF still needs the columns), so a future maintainer doesn't revert to an early `RETURN`. | Comment only. |

**Verification after fix:** re-applied the proc to `AiSolutionsTrackerDev`; `GET /requests/LIT-9001`,`LIT-9002` → **200** (was 500); `LIT-9004`,`LIT-9006` (escalated) → **200** with the bridge block present and correct (`isEscalated:true`, `aiSolutionsStatus:"QA"`). API build unchanged (SQL-only fix). tSQLt not runnable in this environment (framework not vendored) — behavioral coverage exists (`test_GetBridgeEmptyWhenNotEscalated` / `…ForNonMember`) and still passes with the fix.

## Iteration 3 — design-fidelity reconciliation to the prototype (user directive: "prototype should win")

The Iteration-2 design-fidelity drift on the slice's own surfaces was reconciled TO the prototype (the prototype is current, not stale). Applied:

| Surface | Change | Files |
|---|---|---|
| **S4 Watchers & alerts** | Relabelled "Notify me about" → **"Notify watchers about"**; **ungated** the 5 preference toggles (always visible, not behind "Watch this record"); added the **"Active alerts"** section (empty-state copy per the prototype). | `web/src/features/watchers/WatchersCard.tsx` |
| **Ungate — full stack** (so a non-watcher's prefs read/persist) | New read proc `usp_GetMyWatcherPreferences` (returns the caller's 5 effective prefs, defaults-all-true, independent of watch state — always one row, no early-RETURN); keyless entity `MyWatcherPreferencesRow` + DbContext registration; `WatcherListDto.MyPreferences` (`WatcherPreferencesDto`); service reads it in `GetAsync`; shared `collaboration.ts` `WatcherPreferences` + `WatcherListDto.myPreferences`; component reads `myPreferences`. | `database/procedures/watchers/usp_GetMyWatcherPreferences.sql`, `api/Api/Data/Entities.cs`, `AppDbContext.cs`, `WatcherDtos.cs`, `WatchersService.cs`, `shared/types/collaboration.ts`, `WatchersCard.tsx` |
| **S2 Requests list** | **Removed** the per-row `StatusHoldPill` + its import (prototype list shows no hold pill on rows). Pill remains on the record-detail header where the prototype shows it. | `web/src/features/requests/components/RequestsListPage.tsx` |
| **S4 Status control** | Relabelled the tri-state control "Status" → **"Status override"** (prototype field label); kept In progress/On hold/Abandoned option vocabulary (spec-correct, consistent with the pill). | `web/src/features/requests/components/RecordDetailPage.tsx` |
| **Tests** | `WatchersCard.test.tsx` rewritten (always-visible toggles, new labels, non-watcher-settable, Active-alerts); `WatchersControllerTests.cs` (3-arg `WatcherListDto`); `RecordDetailPage.test.tsx` ("Status override" combobox, "Notify watchers about" + "Active alerts"); `api.test.ts` / `useWatchers.test.tsx` (myPreferences in mocks); +2 tSQLt cases for the new proc in `test_WatcherPreferences.sql`. | (test files above) |

**Verification:** API build clean; **`dotnet test` 577/577**; **web `jest` 1149/1149** (coverage branches 79.87%, within the `[78%,80%)` tolerance); backend ungate verified live — `GET /records/LIT-9001/watchers` (a non-watcher) returns `myPreferences` all-true with 0 watchers; Requests list re-rendered with no row pill (matches the prototype); **design-conformance PASS** (349 files, 0 violations, exit 0 — scanned the post-reconciliation code). tSQLt for the new proc authored but unrun (framework not vendored — environment limit).

**Not reconciled (cross-slice / systemic — see `deferred-architectural.md`):** the older record-detail structure drift (dark-vs-pale section pills, Status-tab meta/SLA/history blocks, tab order) from slices 5/9/21; the DCLogic-prototype design-fidelity tooling gap; tSQLt not runnable here.

# slice-users-access-4a32c37 — test failures & coverage gaps

## Iteration 1

### Fixed this pass
- `UsersAccessPage.test.tsx` — 4 tests failed on a **test-setup bug** (mocked `fetchMe` → `undefined` errored the seeded `/users/me` query). Fixed mechanically (see `remediations-applied/`). Now 27/27 users tests pass.

### Not a slice-17 failure (pre-existing / environmental)
- **`FieldEditorSheet.test.tsx` (slice 3)** — one 5s **timeout** (not an assertion failure) when the coverage suite ran concurrently with the API suite + the conformance scan. **In isolation the full suite is 748/748 pass, 138/138 suites** — confirmed a load/contention artifact, not a regression. (The prior slice-5 log records the same test as "load-flaky under coverage instrumentation.")
- **`HealthTests.Health_returns200_withStatusOk` (API)** — 1 failure in the full `dotnet test` (432/433). Reproduces on base `dev`; pre-existing and unrelated to slice 17 (documented in slice-13's log). My 22 Members tests all pass.
- **13 pre-existing `tsc` errors** in slice 6/8/11/12 **test** files (attachments/gates/BellMenu) — unchanged; 0 new. Left per the slice-15/16 cleanup deferral.

### Coverage gap — pre-existing debt, developer-accepted (not slice 17)
- `npm run test:coverage` (isolated) → **stmts 86.31% / branch 76.05% / func 78.72% / lines 87.39%**; exits 1 against the hard global 80% threshold.
- **Attribution:** this is the same known debt from **slices 1–14** that slices 15 and 16 both shipped with (slice-15 log: "76% branches / 77% functions … Developer accepted as pre-existing"; slice-16: "~76–77%"). Slice-17's own files sit **above** the global average (feature 100% stmts/func/lines; components 92.2/78.72/90/95.83), so by the arithmetic the prior slices used, adding them can only **raise** the global — the shortfall is not a slice-17 regression. Uncovered branches in slice-17 files are defensive (`workspaceId` disabled-hook fallback); all required behaviour cases are covered.
- **Below the `[78%, 80%)` band on branches (76.05%).** Raising the whole project to floor is accumulated cross-slice debt, out of scope for slice 17 (surgical-change rule). **Surfaced to the developer for a decision** — same disposition as slices 15/16.

### tSQLt
- `tSQLt.RunAll` **not executed** — the assertion framework is **not vendored** in the repo (same as every prior slice). The 3 slice-17 test files are authored following the vendored `FakeTable`/`ExpectException`/`AssertEquals` patterns. This slice adds **no migrations** (3 `CREATE OR ALTER` procs against existing tables), so there is no schema-deploy delta; the full real-engine DB standup is deferred per the earlier-slice precedent.

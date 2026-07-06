# slice-sla-aging-007240f — iteration log

**Label:** slice-sla-aging-007240f
**Scope source:** no watermark (fresh slice worktree) → full working-tree diff
**Layers in scope:** database (2 migrations + 4 procs + tSQLt), api (ConditionEngine + Requests service/DTOs/entities + 7 test files), web (RecordDetailPage + test), shared types
**Started:** 2026-07-06T16:32Z
**Final status:** UNRESOLVED-PREEXISTING-DEBT — slice-21 work is clean on every runnable gate; two repo-wide gates fail on pre-existing debt (slices 19/20) and design-fidelity/tSQLt execution deferred with developer authorization.

## Iteration 1

### Phase 0 — unit tests (authored in-slice, verified here)

- **API (`dotnet test`, affected classes):** **89 / 89 PASS** — `ConditionEngineTests` (current-date token, date-aware comparisons, `DateDifferenceDays`), `RequestsValidationTests` (`ComputeSla` window boundaries incl. due-today/zero-window, `ComputeTimeInStage`), and the 5 `RequestDto`-fixture consumers (`RequestsController`, `Closure`, `Copy`, `Escalation`, `TypedLinks`) updated for the new `TimeInStage` positional param.
- **API (`dotnet build` Api + Api.Tests):** 0 warnings / 0 errors — validates the positional-record-param + `IClock`-injection + `DateOnly?` binding ripple.
- **Web (`jest`, affected suites):** **40 / 40 PASS** — `RecordDetailPage` (3 new: Overdue pill + `5 days`; Due-soon pill + `Today`; no-due-date → no pill), `RequestsListPage` (existing `slaStatus: 'Overdue'` tint), `AgingTint`. Every rendered state carries a jest-axe assertion.
- **Web (`jest`, full suite):** **947 pass / 1 fail**. The one failure is `src/shared/components/Layout/navItems.test.ts` (`NAV_SECTIONS` expects `['Workspace','Reference','Admin']`; received `+ 'Platform'`) — **pre-existing since slice 19** (platform-admin added the Platform nav section without updating this test). Slice 21 touches no nav/layout file; net-new failures = 0.
- **Web coverage (global):** stmts **89.74%** · branch **80.61%** · funcs **84.97%** · lines **90.65%** — all above the 80% floor. `RecordDetailPage.tsx`: 88.6% stmts / 91.36% lines; my new `slaPill`/`formatTimeInStage`/render paths are covered by the 3 new tests (the 68% file-branch figure is the pre-existing 6-tab/escalation/hold body, not slice-21 additions).
- **tSQLt (`test_RequestsCore`, 3 new cases):** authored — `StageEnteredAt` stamped on create, reset-on-change, preserved on same-stage set. **Not executed** — needs the LocalDB + tSQLt harness (PrepareServer + 49-migration/proc apply); deferred per the slices-1–2 / slice-18 pattern.

### Phase 1 — code review

- **Design conformance hook (`--web-required`):** timed out at 180s (documented environment issue — see prior ship-notes). My frontend diff contains **zero** raw colours / radii (`git diff` grep clean); the SLA pill reuses the `StatusPill` primitive and time-in-stage is plain text — conforms by inspection.
- **ESLint (my files):** `RecordDetailPage.tsx` + `.test.tsx` → **0 errors**.
- **Manual review (api-middletier / database-backend / web-frontend):** no High/Medium findings.
  - `ComputeSla` / `ComputeTimeInStage` are pure static (unit-tested); `MapRow` pure; `today` comes from `_clock`, never `DateTime.UtcNow`.
  - `ConditionEngine` gains `IClock` via constructor injection (both singletons — safe); no I/O, no PII, no logging.
  - Procs: `usp_SetRequestStage` resets `StageEnteredAt` only on a real stage change (CASE guard); `usp_QueryRequests` `ISNULL(..., 3)` guards the API's non-null `GetInt32`; `usp_GetRequestByIdForUser` keeps the `WorkspaceMembership` access join (403-uniform) — the added `Workspaces` inner join is on the record's own workspace and does not broaden access. All keep NOCOUNT/XACT_ABORT/TRY-CATCH, parameterised, no `SELECT *`.
  - Migrations 048/049 idempotent (`COL_LENGTH` guards) with rollbacks; one logical change each; header comments.
  - Web: `slaPill`/`formatTimeInStage` pure; StatusPill receives primitives (no inline-object props); renders states; no `dangerouslySetInnerHTML`.
- **Design-fidelity render-and-compare:** **deferred with authorization.** Slice 21 changes a prototyped screen's rendered output (S4/S5 meta strip), but the change is an **intentional Phase-2 divergence** the slice plan authorizes as `[prototyped hooks]`: the prototype's SLA slot is binary (On track / Overdue) and has no time-in-stage; §17.2 specifies the three-state SLA and §10.6 the time-in-stage meta item. A build-vs-prototype render would flag these spec-authorized additions as `added-element` / `content-drift` — false-blocking. The new UI is verified to render correctly and pass axe via jest. Same deferred-with-authorization posture as the slices-1–2 / slice-18 / quality-gate-cleanup ships; no CLEAN design-fidelity manifest fabricated.

### Phase 2 — security review (OWASP)

No Critical/High/Medium in slice-21 code.
- **A01 access control:** `usp_GetRequestByIdForUser` still gates on `WorkspaceMembership` (inaccessible record → zero rows → 403-uniform); stage-set access checked API-side (unchanged).
- **A03 injection:** every proc value parameterised; EXEC command text constant; new columns are static SELECT — no concatenation.
- **A09 logging / PII:** no new logging; `DueDate`/`StageEnteredAt`/`DueSoonWindowDays` are non-PII; `ConditionEngine` logs nothing.
- **Deps:** no new npm or NuGet packages.

## Pre-existing repo-wide gate debt (inherited; not introduced by slice 21)

| Gate | State | Origin |
|---|---|---|
| Web `jest` full suite | 1 fail (`navItems.test.ts`) | slice 19 (added the Platform nav section; test not updated) |
| Web `tsc --noEmit` | 1 error (`platform-admin/api.test.ts`) | slice 20 (left "for the test-file cleanup pass") |

Slice 21 adds **0 new** tsc errors, **0 new** test failures, **0 new** lint errors, and is coverage-net-neutral/positive. A future `fix/quality-gate-cleanup`-style branch is the right home for the two inherited items (matching how the earlier debt was cleared).

## Final Status: UNRESOLVED-PREEXISTING-DEBT
`.last-clean-run.json` **not written** — a CLEAN cache must not be produced while repo-wide gates fail (even on inherited debt) and design-fidelity/tSQLt execution is deferred. Developer authorization required to ship past this status (see ship-notes.md).

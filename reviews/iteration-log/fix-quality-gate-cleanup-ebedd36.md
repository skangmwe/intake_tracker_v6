# fix-quality-gate-cleanup-ebedd36 — iteration log

**Label:** fix-quality-gate-cleanup-ebedd36
**Scope source:** uncommitted working tree (ad-hoc fix branch `fix/quality-gate-cleanup` off `dev` @ ebedd36)
**Layers in scope:** web (frontend — 8 source files, many test files) + api (1 test file: `HealthTests.cs`)
**Started:** 2026-07-06T18:27Z
**Final status:** CLEAN (code review + security review + unit tests + coverage) with **design-fidelity render-and-compare DEFERRED — developer-authorized** (see below)

## Purpose

Ad-hoc cleanup of the four pre-existing quality-gate failures inherited across earlier slices
(documented in `iteration-log/slice-views-dashboards-audit-843471f.md` and `ship-notes.md`). Not a
slice — a `fix/` branch. The four failures and their fixes:

1. **Web `tsc --noEmit`** — was 13 errors in test files (`noUncheckedIndexedAccess` /
   `exactOptionalPropertyTypes`). Actual count surfaced higher as the shared `mockedFetch.mock.calls[0]`
   pattern appeared in several api test files. Fixed with non-null assertions on known-populated
   fixtures (the project's test convention) and, for `BellMenu.test.tsx`, a record-less notification
   built as an explicit literal (recordId omitted, not set to `undefined`). → **0 errors**.
2. **Web `eslint`** — the ship-notes named 3 files; `eslint .` actually reported **19 errors across 12
   files** (the ship-notes under-enumerated). All fixed to make the binary gate green: dead
   imports/vars removed; one `&apos;` escape; one `react/display-name` on a test wrapper; and justified
   `eslint-disable` comments for the intentional a11y patterns (scrim-overlay mousedown-to-close on
   Modal/EscalateModal/SavedViewEditor; scrollable-region `tabIndex` on MembersTable/ImportReportTable;
   the focusable resize-separator + convenience row-click in TableShell) — each matching the existing
   `AuditLogTable.tsx` precedent. → **0 errors** (1 pre-existing warning left; warnings don't fail the gate).
3. **Web coverage** — was branches 76.63% / functions 79.18% (floor 80%). Added real behaviour tests to
   the worst-covered files (SavedViewEditorTabs, SavedViewEditor, TableShell, download.ts, requests/api,
   features/api, savedViewEditorModel, lifecycleDraft, fieldForm, TasksTab, AddToCatalogPage). → branches
   **80.2%** / functions **84.4%** / statements 89.32% / lines 90.24%. **888 tests pass.**
4. **API `dotnet test`** — `HealthTests` failed with IDW10106 (bare `WebApplicationFactory<Program>` with
   no AzureAd config). Gave it the same in-memory AzureAd config `AuditEndpointsTests`/`SearchEndpointsTests`
   use. → **438 pass, 0 fail** (was 437 + 1).

## Iteration 1

### Phase 0 — unit tests
All authored/extended tests pass; full suite **888 pass / 152 suites** (serialized — concurrent runs OOM
the box, an environment memory issue, not a test failure). Coverage clears the 80% floor on every metric.

### Phase 1 — code review
- **Design-token conformance** — the full-repo `check-design-conformance.sh --web-required` hook **timed
  out at 3 min** in this environment (documented tooling friction). Verified directly on the diff instead:
  **no raw colours / rgb()/hsl()/oklch() / off-token radii added in any changed `.tsx` source.** PASS for
  this changeset.
- **Manual code review** — **0 findings.** Every non-test source edit is verifiably non-functional:
  justified `eslint-disable` comments, one `&apos;` escape (renders identically to `'`), one unused-import
  removal (`ActivityThreadItem`), and a `<>…</>` fragment wrapping the TableShell separator (semantically
  identical — fragments render nothing). No behaviour/layout/style change. Test files follow web-testing.md
  (AAA phases, `unit — scenario — expected` naming, jest-axe on component tests, query-by-role/label).
- **Design-fidelity render-and-compare** — **DEFERRED, developer-authorized.** A design handoff is present
  (`DESIGN-HANDOFF: PRESENT`), which normally triggers a full-app build-vs-prototype visual audit. It is
  **not feasible in this environment** (the trivial conformance shell hook already times out at 3 min; the
  ship-notes document repeated OOMs / cygwin fork failures making full-app renders high-risk) **and this
  changeset is non-visual** — no prototyped screen's rendered output changes (comments / apostrophe / tests
  / API test-config only). The developer explicitly authorized shipping with this gate deferred, matching
  the documented posture of the prior two ships (slices 1–2 and slice 18). No CLEAN design-fidelity manifest
  was fabricated; no CLEAN cache written.

### Phase 2 — security review (OWASP)
**0 findings.** No auth / access-control / injection / secrets / PII surface touched; no new npm or NuGet
dependency; no `dangerouslySetInnerHTML` / `eval`. `HealthTests.cs` adds only in-memory test configuration
with synthetic GUIDs (not secrets).

## Final Status: CLEAN (code + security + tests + coverage); design-fidelity render-and-compare DEFERRED (authorized)

`reviews/.last-clean-run.json` **NOT written** — a CLEAN cache must not be produced while the
design-fidelity step did not execute (even under authorized deferral). `/dev-ship` proceeds on explicit
developer authorization, consistent with the prior ships.

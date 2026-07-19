# Tests added / extended — slice-multi-lifecycle-picker-3e6e19b

## Iteration 1

Tests were authored in-slice by `/dev-build-application`; Phase 0 only extended/fixed as needed.

**Authored in-slice (verified running this gate):**
- API `RequestsResolveLifecycleTests.cs` — 6 cases: explicit id wins; explicit-not-found → requestType;
  → default; requestType match; → default; no-default → first.
- API `LifecycleServiceTests.MapSummaries_*` — ordering (sortOrder→name) + field mapping.
- API `LifecycleControllerTests.GetLifecycles_*` — 200 (Viewer) + 403 (no membership).
- Web `lifecycle/api.test.ts` — `fetchWorkspaceLifecycles` path + abort signal.
- Web `useLifecycle.test.tsx` — `useWorkspaceLifecycles` fetch + disabled-without-workspace.
- Web `LifecyclesBar.test.tsx` — dropdown render/select/new/rename/make-default/remove + axe (rewritten
  from chip-bar).
- Web `lifecycleDraft.test.ts` — `requestType`-mirrored-from-name case; renamed patch test.
- Web `IntakeFormPage.test.tsx` — picker hidden (1 lifecycle) + shown-with-names + submits `lifecycleId`.
- Web `test-utils.buildLifecycleSummary` fixture.

**Fixed this gate (Phase 0, mechanical):**
- Web `LifecyclePage.test.tsx` — 2 page-level tests updated from the old chip bar to the dropdown
  (`combobox`/`option`/`textbox` queries). See `test-failures/`.

No zero-assertion or placeholder tests. jest-axe assertions present on all rendered-component suites.

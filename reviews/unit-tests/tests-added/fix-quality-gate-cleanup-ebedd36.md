# Tests added / extended — fix-quality-gate-cleanup-ebedd36

## Iteration 1 — coverage-floor remediation (real behaviour tests, not filler)

**New test files**
- `web/src/shared/http/download.test.ts` — `saveBlob` (object-URL create/click/revoke; revoke-on-throw).
- `web/src/features/saved-views/components/SavedViewEditorTabs.test.tsx` — FiltersTab / FieldsTab / SortTab
  add·update·remove, the column-shuttle reorder incl. boundary no-ops, label fallback (biggest single win:
  ~36 fns + ~26 branches, previously untested).
- `web/src/features/requests/api.test.ts` — every requests/drafts wrapper, with and without an abort signal.
- `web/src/features/features/api.test.ts` — every Feature-Catalog wrapper, with and without an abort signal.

**Extended existing suites**
- `TableShell.test.tsx` — cross-column sort, no-handler inertness, centre-align cell, filterable slot, drag-resize.
- `SavedViewEditor.test.tsx` — edit flow, tab switch (mouse + arrow/Home/End + non-nav key), scope/default
  toggles, saving/error/success states.
- `savedViewEditorModel.test.ts` — number/boolean clause mapping + op fallback, text/select row mapping,
  empty-column guard, sort-row drop.
- `lifecycleDraft.test.ts` — new stage/gate id-omit, unknown-stage remove, non-default lifecycle remove.
- `fieldForm.test.ts` — null-optional coercion, blank-section→null, non-empty visible stages, label-kept,
  needs-value comparator, DerivedCategory build, non-numeric bound → null.
- `TasksTab.test.tsx` — create/promote/approval error banners, Unphased gate fallback, two-gates-same-phase,
  me-not-loaded, in-flight promote.
- `AddToCatalogPage.test.tsx` — prefill-from-draft (array/string/repo fields + `??` fallbacks), optional-field
  stamping + draft discard on success, error + saving states.

**Result:** 888 tests pass across 152 suites; global coverage branches **80.2%** / functions **84.4%** /
statements 89.32% / lines 90.24% — clears the 80% floor on every metric.

# Code-review findings — fix-view-toggle-gallery-55f5b98

## Iteration 1

Scope: 14 changed files (view-toggle / gallery / board polish; diff-only). **No findings.**

Notes:
- Page sizes are named constants (`BOARD_PAGE_SIZE`, `GALLERY_PAGE_SIZE` = 100 = API max); canonical
  view order is a named `KIND_ORDER` in one place; `--control-h-btn` in the token override layer.
- Shared `ViewModeToggle`/`ViewBar` changes are additive (new `iconOnly` / `trailingSlot`); existing
  consumers unaffected (full suite green). `data-ds="segmented"`/`"view-bar"` handles preserved.
- Board stage columns derive from `useLifecycleConfig` (memoized); grouping by stage key, titled by
  label — no hardcoded stage names.
- Pre-existing: page components already exceed the soft length ceiling; net change is small and in
  the same shape. Not raised.

# Unit tests added/extended — fix-view-toggle-gallery-55f5b98

## Iteration 1

- **ViewModeToggle.test.tsx** — canonical-order (renders list→board→gallery regardless of `available`
  order); `iconOnly` keeps accessible name + adds `title` tooltip + `rv-toggle--icon-only` class;
  iconOnly axe pass.
- **ViewBar.test.tsx** — `trailingSlot` renders on the right, before the primary action.
- **ToolkitSurface.test.tsx** — updated the toggle test (`List view` → shared `Table`); added
  gallery-hides-footer / table-shows-footer.
- **FeatureCatalogPage.test.tsx** — added gallery-hides-footer / table-shows-footer.
- **RequestsListPage.test.tsx** — mocked `useLifecycleConfig` (7-stage default lifecycle); board shows
  **all 7 stages** by label incl. empty (`Intake (1) … Closure (0)`), no pager, table gone, axe clean;
  added table-keeps-pager.

Full web suite: **1386 passed / 245 suites / 0 failed.**

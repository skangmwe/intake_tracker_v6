# Unit tests added/extended — fix-requests-board-view-50f6555

## Iteration 1

Extended `web/src/features/requests/components/RequestsListPage.test.tsx` with 3 cases covering
the re-added view-mode toggle (scoped to Table + Board):

1. **`offers only Table and Board layouts (date/gallery are Dashboards-only)`** — asserts the
   `Requests layout` group exposes Table (pressed by default) + Board, and that Timeline / Agenda
   / Gallery buttons are absent. Locks the scope decision in a test.
2. **`switching to Board groups rows into stage columns and drops the table`** — two rows in
   different stages ⇒ two labelled board regions (`intake (1)`, `triage (1)`); the table role is
   gone; `axe` clean on the Board state (the required non-default-state a11y assertion).
3. **`a Board card opens its record`** — clicking a board card invokes navigation to
   `/requests/:id` (exercises `toViewItem`'s `onOpen`).

Full file: **22/22 pass**. No existing tests removed or weakened.

# Code review — fix-requests-remove-viewmodes-997638a

**Scope (review_scope):** `web/src/features/requests/components/RequestsListPage.tsx`, `web/src/features/requests/components/RequestsListPage.test.tsx`. Pure removal — 8 insertions / 117 deletions.

Checklists: `web-frontend.md`, `web-coding-standards.md`, `web-component-architecture.md`, `web-styling.md`.

## Iteration 1 — 0 findings

Reviewed against the frontend basic + advanced checklists:

- **Dead code / unused imports** — the `RecordViews` import (`AgendaView`, `KanbanView`, `TimelineView`, `ViewModeToggle`, `RecordViewItem`, `RecordViewKind`) and the helpers only it used (`REQUEST_VIEW_KINDS`, `slaBadges`, `toViewItem`, `deriveStageOrder`) are all removed together with the `viewMode` state and the `renderAdvancedView` branch. No orphaned references remain (grep-verified). Retained imports (`SlaStatus`, `ReactNode`, `agingTintClass`) are still used. ✔
- **Shared component impact** — `KanbanView`/`TimelineView`/`AgendaView`/`ViewModeToggle` remain exported and are still consumed by `FeatureCatalogPage`; nothing orphaned. ✔
- **Component length / complexity** — reduced. No new state, props, or effects. ✔
- **`layoutSlot`** on `ViewBar` is optional (`layoutSlot?`) — dropping it is safe; ViewBar renders `{layoutSlot && …}`. ✔
- **Design tokens** — no style changes; the deterministic `check-design-conformance.sh --web-required` gate is the authority (PASS). ✔
- **Tests** — the two removed tests exercised the now-removed Board/Timeline switching. Remaining 19 tests pass; `tsc --noEmit` introduces **zero** new errors vs the dev baseline (10 pre-existing, unrelated, none in `requests/`). ✔

No mechanical fixes required. No architectural findings.

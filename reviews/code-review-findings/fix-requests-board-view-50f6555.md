# Code-review findings — fix-requests-board-view-50f6555

## Iteration 1

Scope: `web/src/features/requests/components/RequestsListPage.tsx` + `.test.tsx` (diff-only).

**No findings (Critical / High / Medium / Low).**

Notes:
- Restored helpers (`slaBadges`, `toViewItem`, `deriveStageOrder`) are pure and mirror the
  previously-reviewed slice-24 implementation, trimmed to the board's needs (no `dateValue`,
  since only kanban is offered — timeline/agenda are not shipped here).
- Layout list is a named module constant (`REQUEST_VIEW_KINDS`); no magic numbers; descriptive
  identifiers throughout (no single-letter loop vars).
- No new dependencies. Reuses existing shared `RecordViews` components and design tokens.
- Pre-existing: the page component exceeds the soft length ceiling — unchanged in kind by this
  ~50-line addition, which repeats the shape that previously passed review. Not raised as a new
  finding.

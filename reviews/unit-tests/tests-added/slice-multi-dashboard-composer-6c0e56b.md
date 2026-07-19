# slice-multi-dashboard-composer — tests added / extended

## Iteration 1
Authored in the slice (Sub-cuts A–C). Phase 0 ran them; no required cases were missing.

- **DB (tSQLt):** `database/tests/dashboards/test_DashboardComposer.sql` — 7 cases (create composed row shape; list excludes others' Personal; update visibility+widgets; composed KPI four metrics; KPI dept scope; breakdown by origin; composed grid scoped page+count). Authored; **not run** locally (tSQLt framework not vendored — runs at CI, see test-failures).
- **API (xUnit):** `DashboardsControllerTests` +9 (create 201 / missing-name 400 / shared-by-non-admin 403; add-widget ok / invalid-type 400 / kpi-without-metric 400 / seeded 403; delete unknown 404; update seeded-read-only 403). Full API suite **595/595 green**.
- **Web (jest + jest-axe):** `widgetTypeCatalog.test.ts`, `composerModel.test.ts`, `useComposerScopeOptions.test.ts`, `SegmentedToggle`, `NewDashboardSheet`, `WidgetComposerSheet`, `DashboardSwitcher`, `ComposedDashboardSurface`, updated `DashboardPage.test.tsx`. Full web suite **1193/1193 green**.

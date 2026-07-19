---
slice: 28-multi-dashboard-composer
capability: A user switches between Shared/Personal dashboards, creates a composed dashboard, and adds/edits/reorders/removes widgets via the S6 composer; seeded dashboards keep their fixed layout and are read-only on the composer path.
spec-section: v2-reconciliation §Model deltas 7 + §API deltas Multi-dashboard composer; BS §10.2 (widget palette); blueprint §Dashboards (S6 multi-dashboard)
started: 2026-07-19T09:41:57-04:00
ended: 2026-07-19T12:17:17-04:00
duration: 02:35:20
---

# Slice 28 — Multi-dashboard composer (S6 upgrade)

Built in three checkpointed sub-cuts: **A** DB + API composed engine, **B** web composer UI, **C** S32 wiring + e2e + docs.

## The load-bearing decision — a new composed resolver alongside the fixed set

Slice 23 resolves seeded dashboards through a **fixed set of ~16 named metric resolvers** keyed by `config.metric`. The v2 addendum optimistically said "the slice-23 engine handles Composed dashboards unchanged" — but the composer's vocabulary (KPI metrics `count`/`unassigned`/`overdue`/`high-priority`; group-by dimensions `origin`/`stage`/`analyst`/`priority`; dept + stage scope) **does not exist** in the seeded set. So slice 28 adds a **generic composed resolver** (`DashboardMetricResolver.ResolveComposedAsync`) that dispatches on the widget **type** and reads the composed config, over three new procs:

- `usp_GetDashboardComposedKpi` — a scalar count over the scoped open records for one of the four metrics.
- `usp_GetDashboardComposedBreakdown` — a group-by count (drives both `bar-breakdown` and `segmented-bar`; the C# side shapes percent-of-max vs percent-of-total).
- `usp_GetDashboardComposedGrid` — a two-result-set scoped records page (reuses the DashboardGridRow shape).

`DashboardsService.ComposeAsync` routes by `LayoutMode`: `Fixed` → the seeded resolvers (unchanged, drill-through preserved); `Composed` → `ResolveComposedAsync` (drill off). Seeded dashboards are untouched.

## Decisions

1. **Composed resolver is new, not the fixed engine** (above). Same module, same one-proc-per-shape pattern; seeded path unchanged.
2. **Widget palette = the prototype's four kinds** — Metric (KPI) → `kpi-tile`, Breakdown bars → `bar-breakdown`, Pipeline segments → `segmented-bar`, Records table → `records-grid` — a subset of the 8-type `WidgetType`. Prototype is authoritative for S6.
3. **Scope is multi-select arrays** (`depts[]` / `stages[]`, empty = all) end-to-end, matching the prototype's checkbox scope — an additive refinement of the slice-23-staged `WidgetComposeRequest` (`dept?`/`stage?` → `depts?`/`stages?`), which nothing consumed yet. `depts` are `DeptPgClient` label values; `stages` are stage **keys**.
4. **Personal vs Shared access.** A Personal dashboard is author-only on read and edit (`CreatedBy == userId`); Shared (and seeded) require WorkspaceAdmin. Create: Shared → WorkspaceAdmin, Personal → Member+. `usp_ListDashboards` filters Personal rows to the author; `usp_GetDashboardById` returns `CreatedBy` for the service's author gate.
5. **Seeded-guard is composer-path-only** (reconciles the v2 "seeded read-only" line with slice-23's S32 management): `PATCH /dashboards/{id}` with `visibility` or `widgets`, and all widget CRUD, return **403 `seeded-dashboard-read-only`** on a seeded dashboard; `name`/`audience`/`retire` (S32) stay editable by a WorkspaceAdmin.
6. **Widget-list mutation lives in C#, not SQL.** Widget add/edit/delete deserialize `WidgetsJson`, mutate the list, and persist via the existing `usp_UpdateDashboard @WidgetsJson` — no per-widget SQL. Reorder = `PATCH /dashboards/{id}` with the full reordered `widgets` list.
7. **Nullable `Slug`.** Composed dashboards carry no slug; migration 063 relaxes the `CK_Slug` check to allow NULL. `SavedDashboardDto.slug` / `DashboardListItemDto.slug` widened to `DashboardSlug | null`.
8. **Composed widgets reuse the existing `WidgetRenderer`.** kpi-tile/bar-breakdown/segmented-bar/records-grid already have renderers; the composed surface adds the 2-col Half/Full grid + edit-mode controls, not new widget bodies. `config.metric` became optional (composed widgets lack it) → a null-safe `metricIcon()` helper replaced the direct `METRIC_ICONS[config.metric]` index in the 5 seeded widgets.
9. **Composer scope options** come from existing Viewer-gated reads — departments from the `deptPgClient` select field (`useWorkspaceFields`), stages from the default lifecycle (`useLifecycleConfig`) — via `useComposerScopeOptions`. Both hooks were exported from their feature barrels for cross-feature use.
10. **S32 scopes to Shared.** The list now also carries the caller's Personal dashboards (the switcher needs them); `DashboardsManagementSection` filters Personal out — a Personal dashboard is managed by its author from the composer, not the workspace-admin surface.

## Artifacts

- **DB:** migrations `063` (composer columns + nullable slug) / `064` (mark 4 seeds `IsSeeded=1`) + rollbacks; `usp_CreateDashboard`, three composed resolvers; extended `usp_GetDashboardById` / `usp_ListDashboards` / `usp_UpdateDashboard` / `usp_ProvisionWorkspace`; `test_DashboardComposer.sql` (7 cases).
- **API:** keyless entities (`DashboardComposedBreakdownRow`, `CreatedDashboardIdRow`, composer columns on the two dashboard rows), extended DTOs, `ResolveComposedAsync`, `DashboardsService` create + widget CRUD + guards, controller endpoints + boundary validation; `DashboardsControllerTests` +9 cases (595 API tests green).
- **Web:** `shared/dashboards/widgetTypeCatalog`, `composerModel`, `useComposerScopeOptions`, api + hooks; `DashboardSwitcher`, `NewDashboardSheet`, `WidgetComposerSheet`, `ComposerSheet`, `SegmentedToggle`, `ComposedDashboardSurface`; reworked `DashboardPage`; `IconButton` gained `disabled`. jest + jest-axe for each; `dashboards.spec.ts` extended with a compose flow; `accessibility.spec.ts` S6 heading fixed.

## Gate note

API + Api.Tests build **clean (0/0)**; 595 API tests pass (independently verified). Web `tsc`/jest/Playwright are deferred to the `/dev-ship` gate (no local `node_modules` — slices 15/16/21/23 precedent). tSQLt runs at the ship gate (no local SQL Server). Static review resolved the `metric`-optional ripple, the `IconButton.disabled` addition, and the `DashboardListItemDto` optional-field / switcher-grouping defensiveness before hand-off.

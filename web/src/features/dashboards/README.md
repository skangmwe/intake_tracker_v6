# dashboards

Slice 23 — Seeded Dashboards. Fixed-layout dashboards whose widgets name a metric the API resolves per
viewer; a dashboard never widens record access.

## Surfaces

- **S6 `DashboardPage`** (`/dashboards/:id`) — the full drill-through surface. `ai-default` is styled
  exactly to the prototype ("Dashboard" heading + Pin-as-home + seeded-default subtitle). Owns the drill
  state; a click on a segment / tile / heatmap cell refetches `GET /dashboards/{id}?drill=…`. Also serves
  S14 (workload), S12 (feature catalog), S15 (PG starter) generically.
- **S16 `DashboardViewerPage`** — read-only bound viewer; drill suppressed (API returns
  `supportsDrillThrough=false`). Rendered for a user bound to a single dashboard.
- **S17 `DashboardsList`** (`/dashboards`) — the workspace's dashboards; the sidebar Dashboards item lands
  here. Redirects a bound viewer to S16.
- **S32 `DashboardsManagementSection`** — WorkspaceAdmin panel (embedded in Views & dashboards): edit
  audience / name, retire. `PATCH /dashboards/{id}`.

## Structure

- `api.ts` / `useDashboards.ts` — the three endpoints + TanStack Query hooks (`useDashboardList`,
  `useDashboard(id, drill)`, `usePatchDashboard`).
- `components/DashboardSurface.tsx` + `WidgetRenderer.tsx` — the generic surface and the widget-type
  switch. `components/widgets/` holds one component per widget type (segmented-bar, kpi-tile,
  kpi-with-trend, bar-breakdown, histogram, heatmap-matrix, records-grid).
- `format.ts` / `dashboardsAdminModel.ts` — pure helpers (drill labels, date/format, audience model).

The embedded records grid reuses the shared `TableShell` (S2 items-grid) for resize + sticky header +
accessibility. All styling is token-only via `dashboards.css`.

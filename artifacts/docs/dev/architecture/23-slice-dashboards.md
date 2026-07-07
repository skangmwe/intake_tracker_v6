---
slice: 23-dashboards
capability: Three seeded fixed-layout dashboards (S6 default, S14 Workload, S12 Feature Catalog) + Dashboards list (S17) + PG starter (S15) + firm-wide Dashboard-viewer (S16), plus the S32 shared-dashboards management half carried from slice 18.
spec-section: BS §10.2–§10.5; api-contracts §15; module-boundaries §15
started: 2026-07-06T19:27:26-04:00
ended: 2026-07-06T20:29:16-04:00
duration: 01:01:50
---

# Slice 23 — Seeded dashboards

Built across three parallel layer-agents against a frozen build-contract; the orchestrator authored the shared-type spine and reconciled cross-layer divergences.

## The widget-engine pattern (the load-bearing decision)

Seeded dashboards store their layout as a **`WidgetsJson` list on the `dbo.SavedDashboard` row** — each widget is `{ id, type, title, config:{ metric, objectType?, savedViewId? } }`. The API has a **fixed set of ~16 metric resolvers** (`DashboardMetricResolver`) keyed by `config.metric`; `GET /dashboards/{id}` walks the row's widget list and runs the matching resolver **per viewer**, shaping each result to the widget-type's `data` shape. There is **no generic query engine** — only the metrics R1 seeds exist; an unknown metric resolves to an empty widget rather than failing the dashboard. This was chosen (analyst-approved) over slug-dispatch-in-code because it makes dashboards clonable local objects (§10.5 — the provisioning clone copies `WidgetsJson` verbatim) and is forward-compatible with the R2 no-code builder. The 8-type palette lives in `shared/types/dashboards.ts` (`WidgetType` + per-shape result interfaces); dashboard types moved out of `notifications.ts` into their own per-surface file (mirrors the slice-22 `home.ts` split).

## Access model

- `GET /workspaces/{id}/dashboards` (S17 + S32 list) — Viewer+ of the workspace.
- `GET /dashboards/{id}` — allowed if Viewer+ on the dashboard's workspace **OR** the caller's `WorkspaceMembership` row has `BoundDashboardId == id` (a bound Dashboard-viewer, S16). A bound-only viewer forces `supportsDrillThrough=false` and drill is ignored — that is the firm-wide read-only Feature-Catalog path (§10.4). Existence is checked before access: unknown id → **404**, inaccessible → **403** (api-record-access.md).
- `PATCH /dashboards/{id}` (S32 audience/name/retire) — WorkspaceAdmin only.

## S6 (prototyped) fidelity

Built exactly from `project/AI Solutions Tracker.dc.html` (dashboard block): four-uniform-tile Row 1 (Inflight-status segmented bar with 2-col legend · Escalations-this-quarter kpi-with-trend + per-origin chips · Unassigned kpi + per-origin chips · Closures bar breakdown), full-width 8-column heatmap (Dept/PG/Client × [Intake·Build·Review·Deploy | Live·Declined·Withdrawn·Duplicate] with `— (unset)` row + em-dash zeros + group dividers), Row 3 embedded records grid (reuses the S2 `TableShell` — resize, sticky header — inside the prototype header bar with the drill pill, count, Export-view). **Live drill-through**: a click on any segment/tile/heatmap-cell refetches `GET /dashboards/{id}?drill=<urlEncodedJson>` and re-renders (the real analogue of the prototype's recompute-on-setState). All numbers come from the API resolvers — the prototype's mock fixtures are gone. A generic `DashboardSurface`/`WidgetRenderer` powers S6 and is reused verbatim for S14/S12/S15/S16.

## Divergences (all internal — output contracts unchanged; API + Web bindings intact)

1. **`BoundDashboardId` lives on `dbo.WorkspaceMembership`, not `dbo.Users`** (the build-contract §2 was wrong; migration 004 + data-model.md confirm). Migration **052** FKs `WorkspaceMembership.BoundDashboardId → SavedDashboard`; the API reads the binding from the membership row. DB and API agents corrected this independently and agree.
2. **`escalation-status` (S15 KPI)** uses `RequestCrossingSnapshot` presence as the "AI Solutions Status set" signal — the platform field has no PG-side write path (slice 9 made the mirror read-time-derived). Output `(SetCnt, BlankCnt)` unchanged.
3. **`closures-by-outcome`** uses `UpdatedAt` as the closure-time proxy (no `ClosedAt` column exists; Outcome is `FieldValues.$.outcome`, per slice 10).
4. **`median-time-to-triage`** approximates first-triage as `CreatedAt → StageEnteredAt` (no reliable first-assignment timestamp; documented in the proc header).
5. **Feature grid** maps into the shared `DashboardGridRow` slots (`Stage←Maturity, Origin←FeatureType, Analyst←Owner`); `Tech` shows via the `features-by-tech` widget, not the grid row (the frozen row has four string slots).

## Provisioning + locality (§10.5)

`usp_ProvisionWorkspace` (slice 19) now clones every PG-template `SavedDashboard` into each newly provisioned workspace (fresh id, `WidgetsJson` verbatim, records-grid `savedViewId` null) inside its existing transaction — so a new PG workspace gets the `pg-starter` dashboard as its own local object.

## Gate note

`web/node_modules` is absent in the worktree (project has never run `npm install` locally — slices 15/16/21 precedent), so `tsc --noEmit`/jest/playwright are deferred to the `/dev-ship` gate (`npm ci` first). API + Api.Tests build **clean (0/0)**, independently verified. The DB layer is static-reviewed (no runnable SQL Server locally) — tSQLt runs at the ship gate.

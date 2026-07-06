# saved-views

Slice 14 — **Saved-view editor (S24)**: the tabbed side sheet (Filters / Fields / Sort) and the hooks
the S2/S9 pickers compose.

Slice 18 — **Views & dashboards admin (S32)**: the workspace-admin management surface.

- `ViewsDashboardsPage` (route `/admin/views`) — WorkspaceAdmin-gated; one `SavedViewsSection` per
  object type (Requests / Feature Catalog / Tasks / Announcements), plus the deferred-dashboards note.
- `SavedViewsSection` — lists a surface's shared + own-personal views; promote-to-shared, set/clear
  default, and retire (confirmed via `RetireViewDialog`). All through the existing id-scoped saved-view
  endpoints (shared writes require WorkspaceAdmin).
- `savedViewsAdminModel.toUpsertRequest` — rebuilds the full upsert request from a `SavedViewDto` (the
  PATCH endpoint replaces the definition), with an optional scope/default override.

The shared-**dashboards** half of S32 lands with the Dashboards module (slice 23) — the `SavedDashboard`
table it manages doesn't exist until then (data-model slice-1 note; module-boundaries §15).

# SavedViews

Owns saved-view definitions — a named column / filter / sort set over a list surface (S24). A view is
presentation metadata; it **never widens access** (BS §22.4) — it applies over an already access-
filtered query and rows always resolve to the caller's entitlements. See module-boundaries.md § 14.

Built in slice 14. Surface:

- `GET /api/v1/workspaces/{id}/saved-views?objectType={Request|Feature|Task|Announcement}` — shared
  views in the workspace + the caller's own personal views for that surface (Viewer+).
- `POST /api/v1/workspaces/{id}/saved-views` — create (personal → Member+, shared → WorkspaceAdmin).
- `PATCH /api/v1/saved-views/{id}` · `DELETE /api/v1/saved-views/{id}` — personal by owner, shared by
  WorkspaceAdmin. Delete is soft and never touches records.

`objectType` binds each view to one list surface so a Request view never appears on the Feature
picker. Columns / filters / sort are stored as opaque JSON. `IsDefault` is scoped per (owner,
workspace, objectType) — setting a new default clears the owner's prior default on that surface.

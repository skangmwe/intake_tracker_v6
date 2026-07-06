# audit

Slice 18 — **Workspace audit (S33)**. Firm-wide audit (S39) is slice 19.

The workspace-admin read of the append-only audit trail (BS §12). WorkspaceAdmin-only; the API is the
boundary (403 for non-admins).

- `WorkspaceAuditPage` — resolves the active workspace + admin level, owns the applied filters + page,
  renders the filter bar + log table + pagination and the three non-data states.
- `AuditFilterBar` — date range / actor / record / event-type filters; applies on submit (not per
  keystroke). Actor options come from the workspace member list (supplied by the page).
- `AuditLogTable` — a semantic, data-dense table; the structured payload sits behind a `<details>`.
- `useWorkspaceAudit` / `api` — `POST /workspaces/{id}/audit/query` (paginated, filtered).
- `constants` — the `EventType` filter options + labels + group tint mapping.

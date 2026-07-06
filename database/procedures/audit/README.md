# Audit procedures

Append-only event capture per BS §12.

## Scaffold state

- **`usp_EmitAuditEntry`** — called by the Audit consumer of the event spine. Writes to `dbo.AuditEntry`. Slice 1 (Foundation) adds it, plus the INSTEAD OF UPDATE/DELETE triggers that block mutation of history at every access level (including Platform admin).
- **`usp_QueryWorkspaceAudit`** — the S33 Workspace audit log read (slice 18). Returns a page of a workspace's `dbo.AuditEntry` rows newest-first (joined to `dbo.Users` for the actor display name), with optional date-range / actor / record / event-type filters ANDed; two result sets (page rows + `TotalCount`). Read-only; workspace-scoped. The authoritative access check (WorkspaceAdmin of the workspace) is made API-side.

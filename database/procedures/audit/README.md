# Audit procedures

Append-only event capture per BS §12.

## Scaffold state

- **`usp_EmitAuditEntry`** — called by the Audit consumer of the event spine. Writes to `dbo.AuditEntry`. Slice 1 (Foundation) adds it, plus the INSTEAD OF UPDATE/DELETE triggers that block mutation of history at every access level (including Platform admin).

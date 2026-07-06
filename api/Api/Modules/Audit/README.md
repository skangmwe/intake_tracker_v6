# Audit

Owns the append-only audit trail (module-boundaries.md §19). The **write** path is the event spine's
`AuditWriter` (slice 1) — every meaningful state change lands one immutable `dbo.AuditEntry` row. This
module owns the **read** surfaces.

## Slice 18 — S33 Workspace audit log

- `AuditController` — `POST /api/v1/workspaces/{id}/audit/query`. WorkspaceAdmin-gated (403, never 404);
  `pageSize > 100` → 400 (never clamped, per api/CLAUDE.md). POST-with-body, not a GET query string —
  the filter set is multi-field (matches every peer `/query` endpoint).
- `AuditService` — calls `usp_QueryWorkspaceAudit` via raw ADO.NET (two result sets: page rows +
  `TotalCount`), parameterised. Read-only.
- `AuditDtos` — `AuditLogRowResponse`, `AuditLogQueryRequest` (mirror `/shared/types/audit.ts`).

Firm-wide audit (S39, `/platform/audit/query`) is slice 19 (Platform admin).

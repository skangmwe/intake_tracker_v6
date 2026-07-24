# fix-surface-fields-task-d8eeeb6 — security-review findings

**Scope:** database + api (Task field surfacing — complete the Task export via the manifest).
**Checklists:** database-backend-security.md, api-middletier-security.md (OWASP A01–A10).

## Iteration 1 — 0 findings

- **A01 Broken Access Control** — access is unchanged. `ExportService.ExportObjectAsync` gates
  `HasWorkspaceLevelAsync(userId, workspaceId, Viewer)` before `BuildExportAsync`, and
  `usp_GetTasksForWorkspace` filters `WHERE WorkspaceId = @Ws` — a caller can only export tasks of a
  workspace they are already a Viewer of. The four new columns are attributes of tasks already inside
  that workspace scope, so surfacing them widens no access (BS §22.4). No IDOR, no cross-workspace leak.
- **A03 Injection** — the proc is fully parameterized (`@WorkspaceId`/`@Page`/`@PageSize`, invoked from
  `QueryWorkspaceTasksAsync` via `FromSqlRaw` + `SqlParameter`, unchanged). `TRY_CAST(t.CreatedBy AS
  UNIQUEIDENTIFIER)` casts a stored audit value inside the query; no string concatenation/interpolation.
- **A09 Logging/Monitoring** — no log statements added. Task `Title`, `Notes`, and the captured
  `FieldValue` are Confidential and `CreatedByName` is PII; none are logged — they travel only in the
  authorized export CSV response, consistent with the assignee name already exported.
- **Data exposure** — no internal plumbing surfaced: `WorkspaceId`, `RowVer`, soft-delete columns, and
  the raw `CreatedBy`/`AssigneeUserId` GUIDs are not emitted (GUIDs resolve to display names). Only
  user-meaningful task fields are returned.
- No secrets, no new config, no new external calls.

**End-of-iteration open set:** empty.

## Final Status: CLEAN

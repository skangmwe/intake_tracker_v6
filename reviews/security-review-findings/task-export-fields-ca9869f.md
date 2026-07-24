# task-export-fields-ca9869f — security-review findings

**Scope:** database + api (Task attribute surfacing + Task CSV export).
**Checklists:** database-backend-security.md, api-middletier-security.md (OWASP A01–A10).

## Iteration 1 — 0 findings

- **A01 Broken Access Control** — `ExportService.ExportObjectAsync` gates `HasWorkspaceLevelAsync(userId, workspaceId, Viewer)` before calling `TaskIoObject.BuildExportAsync`; `usp_GetTasksForWorkspace` filters `WHERE t.WorkspaceId = @Ws`, so a caller can only export tasks of a workspace they are already a Viewer of — no cross-workspace leak, no IDOR. Matches the Request/Feature export model (export never widens access, BS §22.4).
- **A03 Injection** — every SQL value passed via `SqlParameter`; no string concatenation/interpolation into SQL. The proc takes typed parameters only.
- **A09 Logging/Monitoring** — no log statements added. Task `Title`/`Notes` are Confidential and the assignee `DisplayName` is PII; none are logged. The assignee name and notes travel only in the authorized export CSV response (product feature), consistent with existing Request/Feature exports that emit analyst/owner names and row values.
- **Secrets / data-at-rest** — no secrets, no new config, no new external calls.

**End-of-iteration open set:** empty.

## Final Status: CLEAN

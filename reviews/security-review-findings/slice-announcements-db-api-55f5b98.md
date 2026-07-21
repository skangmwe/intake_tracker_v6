# slice-announcements-db-api-55f5b98 — security-review findings

**Checklists:** `database-backend-security.md`, `api-middletier-security.md`, `web-frontend-security.md` (OWASP A01–A10).

## Iteration 1 — 0 blocking findings

- **A01 Broken access control** — create still gates `WorkspaceAdmin`; item mutations remain author-or-admin (`usp_GetAnnouncementById` + `CanManageAsync`); inaccessible rows return **403, never 404**. The new **"posted by" (impersonation) path is authorized**: a chosen author other than the actor must be a member of the target workspace (controller for create, service `InvalidAuthor→400` for update). **Audit integrity preserved** — `CreatedBy`/`UpdatedBy` stay the acting admin; only the display attribution (`AuthorUserId`) is the chosen poster.
- **A03 Injection** — all dynamic values passed as `SqlParameter`; no string-built SQL; procs are `CREATE OR ALTER` with parameters only.
- **A04 Insecure design** — status-at-create and scheduled publish are validated (`Active`/`Scheduled` only; Scheduled requires a future time); terminal (`Archived`/legacy `Retired`) rows are immutable in the proc as defense-in-depth.
- **A09 Logging** — no new logging; no PII/user-content logged. `AuthorName` (a display name, PII) is returned only to an authorized admin in the manage list (same pattern as the audit table's `actorName`) and is never logged.
- **Secrets** — none introduced.

No Critical/High/Pending-decision findings.

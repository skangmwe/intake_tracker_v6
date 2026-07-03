---
slice: 02-auth-app-shell
capability: a user signs in via SSO, lands on a sidebar-shell layout, sees their workspace membership in the top-left workspace switcher, and can toggle theme
spec-section: BS §4.1, §4.2, §21; design blueprint (Sidebar shell / Top bar); api-auth.md; api-client-auth.md
started: 2026-07-03T13:55:00-04:00
ended: 2026-07-03T15:11:49-04:00
duration: 01:16:49
---

# Slice 2 — Auth & app shell

Real authentication + the design-token foundation + the app shell every prototyped screen renders inside. See [`decisions.md`](../decisions.md) ADR-0001/0002 for the auth-mode, theme-column, CSP, and design-system-CSS decisions.

## Decisions worth keeping (beyond the ADRs)

1. **`EnsureUserMiddleware` upsert is behind `IUserProvisioner`.** The DB call moved to a thin seam (mirrors `AuditWriter`) so the middleware's per-replica cache + best-effort policy are unit-testable without a database. `UserProvisioner` calls `usp_UpsertUser`.

2. **Security-headers + Cache-Control moved *before* `UseAuthentication`.** They register `OnStarting` callbacks, so placing them ahead of auth means a short-circuited 401/403 still carries the baseline headers — same rationale as OperationId running before auth. This is a deliberate deviation from the scaffold's original ordering (which put them after the auth stub); `Program.cs` documents it.

3. **`GET /users/me` memberships come from `usp_GetUserWorkspaces`** (a join → stored proc per `api-data-access.md`); the user row, platform-admin grant, and theme update are single-table EF. The proc result binds to a keyless `UserWorkspaceRow` via `FromSqlRaw`.

4. **Workspace switcher / bell / search are stubs** (S8 `[deferred]`). Memberships are empty for everyone until slice 17 assigns them, so the switcher renders a graceful empty state; the shell nav is app-scoped and renders regardless. Unbuilt nav destinations route to a shared `PlaceholderPage` so navigation is fully functional now.

## Runbook — local run (dev bypass)

1. `dotnet run` in `api/Api` with `ASPNETCORE_ENVIRONMENT=Development` (loads `appsettings.Development.json`, which sets `Auth:DevBypass:Enabled=true`). The API accepts requests as the fixed local developer — no Entra tenant needed.
2. `npm start` in `web` (dev server on :5173, proxies `/api` → :5080). With no `window.__APP_CONFIG__.entraClientId`, the SPA runs in dev auth mode (no MSAL).
3. The seeded workspaces exist (slice 1) but no memberships do until slice 17, so the switcher shows the empty state — expected at this stage.

**Production auth prerequisites** (not built into code): register the SPA and API in Entra per `api-client-auth.md` (SPA platform, exact redirect URIs incl. dev ports, admin consent), inject `window.__APP_CONFIG__` with `entraClientId` / `entraTenantId` / `apiScope` / `appInsightsConnectionString`, and populate the API's `AzureAd` config. The SPA CSP is dev-scoped in `index.html`; production ships a stricter host-delivered policy.

## Layers touched

Database (1 column migration + rollback, 2 procs, 2 tSQLt suites) · API (auth setup + dev bypass + `CurrentUser` + `IUserProvisioner` + real `EnsureUserMiddleware` + `GlobalExceptionHandler`; `UsersController` + `UserProfileService` + DTOs; CORS; `Users.Theme`) · API tests (xUnit: CurrentUser, EnsureUserMiddleware, UsersController; integration: unauthenticated 401 + anonymous health) · Web (McDermott design-system CSS under `mws/`; config + appInsights + apiClient token + MSAL/dev auth + queryClient + theme + `useMe`; AppShell / Sidebar / TopBar / WorkspaceSwitcher / menus / NavItem / Lockup / IconButton / LoadingScreen; router + pages) · Web tests (jest + jest-axe across components/hooks/utils; Playwright shell + accessibility specs).

Build: `dotnet build Api.sln` → 0 warnings / 0 errors; `npx tsc --noEmit` (web) clean. jest/lint/dotnet test/tSQLt/Playwright are executed at slice-completion by `/dev-review-and-remediate`, which will extend web coverage to the 80% floor if the authored suite falls short.

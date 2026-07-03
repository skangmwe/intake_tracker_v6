---
name: local-testing
description: Launch the app locally for testing with a dev-only Entra auth bypass.
---

Launch the app locally for testing. My environment:
- .NET SDK 10; local SQL Server — **either LocalDB or SQL Server Express** (don't assume LocalDB)
- Frontend: React (TypeScript/Vite), Middle tier: .NET Web API

This is also what `/dev-review-and-remediate`'s design-fidelity step stands the app up with to render-and-compare each screen against the prototype, so it must come up **with no cloud dependency** and **deterministic data**, and tear down cleanly.

1. **Set up the database connection robustly — do NOT assume LocalDB.** Detect the local SQL engine and write the matching connection string into `appsettings.Development.json`:
   - **Prefer LocalDB** when present — `sqllocaldb info` lists an instance (e.g. `MSSQLLocalDB`): `Server=(localdb)\MSSQLLocalDB;Database=<App>Dev;Trusted_Connection=True;TrustServerCertificate=True`.
   - **Fall back to SQL Server Express** when LocalDB is not installed: `Server=.\SQLEXPRESS;Database=<App>Dev;Trusted_Connection=True;TrustServerCertificate=True`.
   - If neither engine responds, treat it as a **blocker** (the API can't boot) and report it — do not silently proceed. When `/dev-review-and-remediate` calls this, an un-bootable stack is a blocking `#render-failed`, never a silent skip.
2. Apply any pending database migrations, then **seed a deterministic dataset** — enough rows that every screen renders populated. The seed is synthetic; no real tenant, no production data.
3. Start the .NET API and React frontend (restore packages if needed). The web dev server proxies API calls to the local API. **Make start/stop idempotent and port-robust** — re-running start when it's already up is a no-op (or a clean restart); detect a port already in use and reuse it or pick the next free port and report it.
4. Add a dev-only Entra auth bypass:
   - Skip token validation in the API when ASPNETCORE_ENVIRONMENT=Development
   - Inject a mock user so all API endpoints work without a real token
   - Skip MSAL sign-in in the React frontend and go straight to the app
5. Tell me the localhost URLs for both once running
6. When done (and always after a `/dev-review-and-remediate` comparison, pass or fail), **tear the stack down and free the ports.**

Security — non-negotiable:
- **Fail closed.** The auth bypass and the seeded local data store are **development/debug-only**. The API **must throw at startup** (refuse to boot) if the bypass is enabled while `ASPNETCORE_ENVIRONMENT` is not `Development` — never silently honour a bypass in a deployed environment.
- **Excluded from release builds.** The bypass handler and the local-store/seed wiring must be guarded behind `#if DEBUG` (and the Development environment check) so a Release build cannot compile or register them.
- No secret, production connection string, or real tenant is ever used.
- Do not commit or push any of these local testing changes to `dev`; add all bypass/test files to `.gitignore`.
- Record the launch path + these guardrails in `artifacts/docs/dev/decisions.md`.

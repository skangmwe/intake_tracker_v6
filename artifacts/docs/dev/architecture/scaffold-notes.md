# Scaffold Notes

*Decisions, gaps, and contract clarifications surfaced while running `/dev-build-scaffold` on 2026-07-03. Written for the scaffold reviewer.*

## Verified during scaffold

- **API builds clean.** `dotnet build` from `api/` returns 0 warnings, 0 errors on `net10.0` (`api-coding-standards.md` — Runtime / Target Framework).
- **`GET /health` returns 200** with body `{ status: "ok", service: "ai-solutions-tracker-api", version: … }` at `http://localhost:5080/health`. Anonymous, no dependencies, no database calls per `api/CLAUDE.md`.
- **Middleware order** in `Program.cs` matches `api-performance.md` § Middleware Order verbatim: exception handler → OperationId → AFD lockdown → (auth stub) → security headers → cache control → controllers.
- **Directory tree** matches `module-boundaries.md` — every module has a folder under `api/Api/Modules/`; every shared concern has a folder under `api/Api/Shared/`; every feature has a folder under `web/src/features/`; every shared UI group has a folder under `web/src/shared/components/`.
- **Shared types compile** as a barrel export at `shared/types/index.ts`.

## Decisions taken (call these out in review)

1. **Swagger deferred out of scaffold.** `Microsoft.OpenApi 2.0.0` (transitive under `Swashbuckle.AspNetCore 6.9.0`) trips `NU1903 High` for [GHSA-v5pm-xwqc-g5wc](https://github.com/advisories/GHSA-v5pm-xwqc-g5wc). Rather than paper over with a `<NoWarn>` I dropped Swashbuckle from `Api.csproj` entirely; `Program.cs` retains the config-flag scaffold (`api-coding-standards.md` — Swagger gated by config, not environment). The slice that first surfaces API docs re-adds it with a pinned `Microsoft.OpenApi` override.

2. **`Api.Tests` project scaffolded** with an xunit smoke test that boots the API via `WebApplicationFactory<Program>` and asserts `/health` returns 200. This is deliberate scaffold overhead — it proves the pipeline wires up under test, and it is the smallest possible seed for future slice tests (`api-testing-guidelines.md`).

3. **`web/package.json` is not installed by scaffold.** The dependency list is defined; `npm ci` runs in CI. I did not run `npm install` locally so scaffold review does not depend on the local machine having the exact resolved lockfile. Slice 2 (Auth & app shell) is the natural place to lock down `package-lock.json`. **Reviewer action:** decide whether to install dependencies at scaffold time or wait for slice 2.

4. **CI workflow expanded** from the stubbed variant-detection template to include real gates per `ci-pipeline.md`: web lint + test + coverage + build, web Playwright E2E, api dotnet build + test, database migration presence + naming. Action versions pinned to `@v5` (latest majors) per the ci-pipeline rule; verified against the current registry at scaffold time (see `ci-pipeline.md` — action-version verification requirement).

5. **Web SPA proxies `/api/*` to `http://localhost:5080` in dev.** Configured in `webpack.config.js` devServer proxy. Matches the health-probe path in `App.tsx`. Production routing goes through Azure Front Door at deploy time — no code change needed.

6. **Content Security Policy on the web index.html is strict + development-scoped.** `connect-src` allows `'self'` and `http://localhost:5080` for the dev-server proxy target. Production ships a stricter policy through Front Door + web CSP middleware; slice 2 finalizes it.

7. **The scaffold contains no domain code.** Every file under `api/Api/Modules/*` and `web/src/features/*` is a `README.md` + `index.ts` placeholder tracing to a slice. Every file under `api/Api/Shared/*` beyond middleware is a namespace-only C# stub or interface signature so the barrel import surface is stable.

8. **The build workspace remains `.claude/worktrees/distracted-galileo-8d5418/`.** `/dev-build-architecture` and this scaffold both wrote here rather than creating a fresh `initial-build` workspace via `begin-change.sh --type build initial-build`. Rationale: the primary `dev` checkout has untracked user-placed inputs (`ai_solutions_tracker_build_spec_final.md`, `DesignSystem-main/`) that would block `begin-change`, and all the design + requirements docs sit unshipped in this worktree. Continuing here keeps every input alongside its consumer. **This aligns with the "Ship strategy A" the analyst chose — one merge commit at the end of `/dev-build-application`.**

## Gaps and TODOs the slice authors should know about

- **Design system tokens are not wired yet.** `web/src/shared/components/` has group READMEs but no `tokens.css` / `mws/tokens.css` file. Slice 2 (or a design-token slice split from it) needs to bring the McDermott token vocabulary in — see `mws-design-system-showcase.html` and `.claude/rules/design/_core-requirements.md`. The design-fidelity gate (`.claude/rules/dev/_core-requirements.md` § "Enforced, not just advised") depends on this.

- **Serilog is not wired.** `api/Api/Shared/Logging/SerilogConfig.cs` is a placeholder. Slice 1 (Foundation) wires the real config with Application Insights sink + required enrichers per `api-logging.md`. Until then, `Microsoft.Extensions.Logging` defaults apply.

- **Ownership guards are stubbed.** `api/Api/Shared/Auth/AccessGuard.cs` returns nothing. Every endpoint slice must gate on it (`api-error-handling.md` — 403, never 404, on ownership violations).

- **Event spine is a no-op.** `api/Api/Shared/EventSpine/EventSpine.cs` is `NoopEventSpine`. Slice 1 replaces it with the real emitter + Service Bus transport for cross-service consumers.

- **Database: only `MigrationHistory` exists.** No seed workspaces, no seed platform-defined fields, no `PrefixRegistry` entries. Slice 1 (Foundation) adds them.

- **Two prototype-specific behaviors need explicit contracts before slice 8 (Gates on records) starts:**
  - Whether the team-only approver-slot model is the final spec or whether named-individual slots stay available (see `slice-plan.md` open questions).
  - The `FrozenApproverSlot.eligibleUserIds` snapshot semantics — the frozen set is the eligibility at gate-open, but the acting member must also be currently in the team's membership when they sign. Slice 8 encodes this as an intersection check.

## Scaffold review checklist

Before signing off:

- [ ] Directory structure matches `module-boundaries.md`.
- [ ] `dotnet build api/Api.sln` returns 0 warnings, 0 errors.
- [ ] `GET /health` returns 200 with an `ok` status body.
- [ ] `api/Api/Shared/` has one folder per shared concern, each with a `README.md` (What belongs / What does not belong).
- [ ] `web/src/features/` has one folder per feature module, each with a `README.md` and `index.ts`.
- [ ] `.github/workflows/ci.yml` includes web + web-e2e + api + database jobs.
- [ ] `shared/types/` has 11 `.ts` files + `shared-types.md` in the architecture index.
- [ ] The scaffold contains no feature logic beyond `/health`.
- [ ] Decisions above are acceptable, or a decision has been re-negotiated (see "Reviewer action" notes).

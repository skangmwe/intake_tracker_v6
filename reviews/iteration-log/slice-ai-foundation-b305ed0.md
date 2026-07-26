# slice-ai-foundation-b305ed0 — iteration log

**Label:** slice-ai-foundation-b305ed0
**Scope source:** working tree (uncommitted) — Phase 4 AI-assist Slice 1 (foundation)
**Files reviewed:** api/Api/Api.csproj, api/Api/Data/Entities.cs, api/Api/Program.cs, api/Api/Modules/Ai/** (AiOptions, Providers/*, Config/*), api/Api.Tests/Ai/**, database/migrations/20260725_095_AlterWorkspaces_AddAiConfig(.sql/_Rollback.sql). Docs (docs/superpowers/**) excluded per scope filter.
**Layers in scope:** API middle-tier, Database (migration). No frontend → no design-fidelity render/compare, no design-conformance token gate.
**Final status:** CLEAN

## Iteration 1 — 1 code finding (mechanical, fixed), 0 security findings, 1 architectural (deferred)

- **Phase 0 — unit tests:** full Api.Tests suite green (924 passed / 0 failed). New AI tests: LlmProviderFactory (4), EmbeddingSerialization (3), AiConfigAllowlist (~8), AiConfigController (6). Providers/embedding client construction wrap external SDKs (network) → integration-only by design, not unit-tested; the factory, byte round-trip, allowlist policy, and controller auth/validation are the unit-tested seams.
- **Phase 1 — code review:** 1 mechanical finding auto-applied — the LLM/embedding singletons built their SDK clients in the constructor, so DI validation / an eager resolve would throw at startup when a key or endpoint is unconfigured (local dev). Fixed by constructing the client via `Lazy<T>` (built on first use, clear `InvalidOperationException` if unconfigured); added `ConfigureAwait(false)` to the stream loops. Source touched → full suite re-run, still 924/0.
- **Phase 2 — security review:** no findings. Secrets (Anthropic/OpenAI keys) load from Key Vault via configuration, never hardcoded or logged; embeddings use Managed Identity (no key). Prompts/responses/record content are never logged (providers do not log). AiConfigService uses EF LINQ (parameterized); the migration is static DDL. AiConfigController gates reads at Viewer / writes at WorkspaceAdmin and returns 403 (never 404); the allowlist is validated at the controller boundary against a fixed non-PII set.
- **Architectural surfaced (1):** `unit-test/api/Api/Modules/Ai/Config/AiConfigService.cs::api-testing-guidelines.md#service-cases` — the EF single-table config service has no happy/round-trip unit test.
- **Developer decision:** defer — the service is a thin single-table EF read/write whose meaningful behaviour requires a real database; `api-testing-guidelines.md` forbids in-memory/SQLite, so the DB round-trip belongs to a CI integration test, while the controller (auth + validation) and the pure allowlist logic are fully unit-tested here.
- **End-of-iteration open set:** empty (the single architectural item is Deferred, not open).

## Final Status: CLEAN
- Total iterations: 1
- Total findings fixed: 1 (mechanical)
- Architectural deferred: 1
- Architectural rejected: 0

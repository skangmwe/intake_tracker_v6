# Code-review findings — slice-ai-foundation-b305ed0

## Iteration 1

### [Mechanical · Medium · FIXED] SDK clients built in constructor → startup/DI-validation risk
- **Files:** `api/Api/Modules/Ai/Providers/ClaudeLlmProvider.cs`, `OpenAiLlmProvider.cs`, `AzureOpenAiEmbeddingService.cs`
- **Rule:** `api-coding-standards.md` (DI lifetimes / robustness), `api-performance.md` (resource management)
- **Issue:** each provider/service constructed its external SDK client in the constructor from a possibly-empty key/endpoint. Registered as Singletons, they can be built during DI validation (`ValidateOnBuild` in Development) or an eager resolve, throwing at startup in an environment where the key/endpoint isn't configured (local dev, or any boot before Slice 2/3 supplies config).
- **Fix applied:** construct the SDK client via `Lazy<T>` — deferred to first use, with a clear `InvalidOperationException("<name> is not configured …")` when unconfigured. Also added `ConfigureAwait(false)` to the `await foreach` stream loops for consistency with the library-code convention. Full suite re-run after the source change: 924/0.

### [Architectural · Low · DEFERRED] EF config service lacks a DB round-trip unit test
- **File:** `api/Api/Modules/Ai/Config/AiConfigService.cs`
- **Rule:** `api-testing-guidelines.md` (required service cases: happy / failure / cancellation)
- **Match key:** `unit-test/api/Api/Modules/Ai/Config/AiConfigService.cs::api-testing-guidelines.md#service-cases`
- **Issue:** `GetAsync`/`SetAsync` are exercised only indirectly (the controller mocks the service). They have no early-return branch, so the project's "never-connected DbContext" unit pattern can't cover them.
- **Decision:** Deferred — the service is a thin single-table EF read/write; its meaningful behaviour requires a real database, and `api-testing-guidelines.md` forbids in-memory/SQLite. The DB round-trip is covered by CI integration against dev SQL; the controller's auth + validation branches and the pure `AiContentAllowlist` policy are fully unit-tested in this slice.

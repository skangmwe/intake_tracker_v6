# AI-Assist Search Chatbot ("Ask") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This repo's commit discipline overrides the generic per-step `git commit`.** Direct `git commit` is blocked by a PreToolUse hook. Each slice is implemented in its own worktree (via `bash .claude/hooks/begin-change.sh --type slice <name>`), verified with the project gate `/dev-review-and-remediate`, and committed **only** through `/dev-ship`. Do not hand-commit. Within a slice, "run the tests" means the layer's gate (`dotnet test api/Api.Tests`, `npm run test:coverage`, tSQLt in CI).

**Goal:** Ship the Phase 4 AI-assist walking skeleton — a grounded, permission-respecting search chatbot ("Ask") that retrieves only records the user can see and answers with Claude, every claim cited to a source record — standing up the reusable AI foundation (LLM provider, embeddings, SSE, guardrail scaffold) that dupe-detection and field-suggestions bolt onto later.

**Architecture:** Three slices. (1) Foundation: `ILlmProvider` (Claude default via the official `Anthropic` SDK, OpenAI alt) + `IEmbeddingService` (Azure OpenAI `text-embedding-3-large` via Managed Identity) + workspace off-switch and content-field allowlist config — no user feature, proven by tests. (2) A SQL-stored per-record embedding table refreshed by a once-daily `BackgroundService` (reusing the Phase 3 `ScheduledTriggerService` pattern) + a permission-safe hybrid retriever (semantic cosine in C# + keyword score, filtered through the existing `WorkspaceMembership`-joined read path). (3) The Ask SSE endpoint (grounded prompt, `[cite:N]` citation events), SQL conversation persistence, the workspace-admin config UI, and the dedicated "Ask" web surface — then ship.

**Tech Stack:** ASP.NET Core (net10.0), official `Anthropic` + `OpenAI` + `Azure.AI.OpenAI` SDKs, EF Core + stored procedures (Azure SQL), `BackgroundService`, Serilog, React 19 + TypeScript + SCSS Modules (webpack, Node 24), Server-Sent Events, xUnit / tSQLt / jest + jest-axe.

## Global Constraints

- **Source spec:** `docs/superpowers/specs/2026-07-25-ai-assist-search-chatbot-design.md`. Build-spec authority: `artifacts/docs/dev/ai_solutions_tracker_build_spec_final.md` §14 (AI-assist guardrails + duplicate worked example), §15 (Phase 4), §17.3 (Request intake fields, PII).
- **Read the governing rule files before writing code for each task** (root `CLAUDE.md` mandatory pre-implementation step). Pointers are named per task. Especially: `api-llm-auth.md`, `api-streaming.md`, `api-performance.md`, `api-secrets.md`, `api-pii-handling.md`, `api-logging.md`, and the design `ai-*.md` rules for the UI.
- **The four §14 guardrails are invariants, enforced by tests:** human-in-the-loop (Ask never writes to a record — it has no write path), permission-respecting (a record the user can't see is never a candidate/retrieved/cited), transparent (AI-labelled, first-use disclosure, every claim cited), off the critical path (AI layer **default-OFF**, workspace-admin opt-in; with it off every existing workflow is unchanged and the surface is absent).
- **Data-sensitivity floor (hard):** only the user's query + an **admin-configured content-field allowlist** (default `Name` / `Description` / `Workflow Details`) of retrieved records may be sent to a provider. **Never send** client number, matter number, requestor/user identities, or any field outside the allowlist. **Never log** prompts, responses, or retrieved content — logs carry counts + `OperationId` + `DurationMs` only. `api-pii-handling.md`, `api-logging.md`.
- **Providers:** Claude via the **official `Anthropic` NuGet package** (`dotnet add package Anthropic` — NOT the community `Anthropic.SDK`), `MaxRetries = 3`. OpenAI via the official `OpenAI` package as the alt chat provider. Embeddings via `Azure.AI.OpenAI` against the project's Azure OpenAI deployment, **Managed Identity** (`DefaultAzureCredential`) — no key in Key Vault. Anthropic + public-OpenAI keys load from **Key Vault** at startup; never hardcoded, never logged. `api-llm-auth.md`, `api-secrets.md`. Add `System.Memory.Data` ≥ 8.0.0 if constructing `BinaryData` for any SDK call (`api-coding-standards.md` NuGet pins).
- **Do not invent limits/thresholds.** `MaxRetries=3`, embedding model `text-embedding-3-large` (3072 dims), allowlist default set, default-OFF, once-daily sweep at the Phase-3 sweep hour, page sizes — all trace to the spec or a rule. Retrieval top-k starts from the existing `SimilarTopDefault` family and is widened only with a one-line justification in the task. No invented numbers.
- **Async discipline:** every async method accepts and passes `CancellationToken`; `ConfigureAwait(false)` in library code; no `.Result`/`.Wait()`; `IHttpClientFactory`/SDK clients, never `new HttpClient()`. Time via `IClock` (`api/Api/Shared/Time/IClock.cs`) — never `DateTime.UtcNow`. `api-coding-standards.md`, `api-performance.md`.
- **DI/config:** constructor injection; `IOptions<T>` for config (never raw `IConfiguration` in services); never inject Scoped into Singleton (BackgroundService uses `IServiceScopeFactory` per sweep). Register in `Program.cs`. Enums serialize as string names (already configured globally).
- **DB:** every table gets PK + 6 audit columns + `IsDeleted`/`DeletedAt`; every FK a non-clustered index; migrations idempotent (`IF NOT EXISTS`) with rollbacks, one logical change per file. Procs: `SET NOCOUNT/XACT_ABORT ON`, `CREATE OR ALTER`, parameterized (`SqlParameter`/`FromSqlInterpolated`, never string concat), header comment. `database-coding-standards.md`, `database-migrations.md`, `database-stored-procedures.md`, `api-data-access.md`.
- **Migration numbering:** next free number is **094**, but uncommitted worktrees may consume it — **`ls database/migrations/` at the start of each DB task and take the next free number.** Do not assume.
- **API:** controllers thin; ProblemDetails on error; `[Authorize]`; workspace-admin authorization on config endpoints; `Cache-Control: private, no-store` on AI responses; pagination on list endpoints (default 20, max 100). `api-error-handling.md`, `api-validation.md`, `api-performance.md`, `api/CLAUDE.md`.
- **Web:** feature-folder structure; `data-ds` on every design-system component; every remote-data component renders loading/error/empty explicitly; colocated `.test.tsx` with jest-axe across meaningful states; tokens only (no raw hex/radii); TanStack Query for server state; App Insights error logging. `web-component-architecture.md`, `web-styling.md`, `web-testing.md`, `web-state-management.md`.
- **Tests ship in the same slice** — never deferred. xUnit service cases: happy / permanent-failure-no-retry / cancellation, plus every branch. tSQLt: happy / NULL-empty / error. `api-testing-guidelines.md`, `database-testing.md`, `web-testing.md`.

---

## Slice sequencing

Each slice is a shippable increment behind its own worktree + `/dev-ship`.

1. **AI foundation** — provider factory (Claude + OpenAI) + embedding service + workspace off-switch & allowlist config + admin read/write endpoints. No user-visible feature; proven by unit tests with mocked SDKs. Branch `slice/ai-foundation`.
2. **Embedding store + refresh sweep + permission-safe retrieval** — `dbo.RecordEmbedding`, the daily `EmbeddingRefreshService`, and `IRecordRetriever`. Tested against seeded records; no chat UI. Branch `slice/ai-retrieval`.
3. **Ask endpoint + UI** — conversation persistence, SSE grounded-answer endpoint with citation events, the workspace-admin config UI, and the dedicated Ask web surface. Branch `slice/ai-ask`.

Slice 3 depends on 1 + 2. Slices 1 and 2 have no user-facing surface by design (walking-skeleton foundation, mirroring the Phase 3 Slice-1 pattern).

---

# SLICE 1 — AI foundation

**Read first:** `api-llm-auth.md` (provider routing, official Anthropic SDK, MaxRetries=3, embeddings on Azure OpenAI via MI), `api-secrets.md` (Key Vault, MI, forbidden patterns), `api-performance.md` (outbound throttling/retry, `IHttpClientFactory`), `api-coding-standards.md` (NuGet pins, `IOptions<T>`, DI lifetimes), `api-pii-handling.md` + `api-logging.md` (never log prompts/responses); re-read `api/Api/Program.cs` and an existing options class (e.g. `ScheduledTriggerOptions.cs`).

### Task 1.1: NuGet packages + AI options

**Files:**
- Modify: `api/Api/Api.csproj` (package references).
- Create: `api/Api/Modules/Ai/AiOptions.cs`.

**Interfaces (Produces):** `AiOptions { string DefaultProvider = "claude"; string EmbeddingDeployment; string EmbeddingModel = "text-embedding-3-large"; int EmbeddingDimensions = 3072; string AzureOpenAiEndpoint; }` bound from config section `Ai`. Secret material (Anthropic key, public-OpenAI key) is **not** on this options class — it loads from Key Vault into the SDK client registration.

- [ ] **Step 1:** Add package references (versions verified against the live NuGet registry 2026-07-25 — match the csproj's explicit-version + comment convention): **`Anthropic` 12.39.0** (the official package — NuGet description "The official .NET library for the Anthropic API"; NOT the community `Anthropic.SDK`), **`OpenAI` 2.12.0** (alt chat provider), **`Azure.AI.OpenAI` 2.1.0** (embeddings — latest *stable*; the 2.x line also has betas, pin the stable). **Do NOT add `System.Memory.Data`** — embeddings take `string` input and return `float[]`, so no `BinaryData` construction; EF Core already pulls `System.Memory.Data` transitively. Re-verify each version is still current before pinning (`curl -fsS https://api.nuget.org/v3-flatcontainer/<id>/index.json`).
- [ ] **Step 2:** `dotnet build api/Api` — expect clean restore.
- [ ] **Step 3:** Write `AiOptions.cs` with the properties above (non-secret config only: endpoint, deployment, model, dims, default provider). Bind in `Program.cs`: `builder.Services.Configure<AiOptions>(builder.Configuration.GetSection("Ai"));`.
- [ ] **Step 4:** `dotnet build api/Api` — clean.

### Task 1.2: LLM provider abstraction + Claude/OpenAI implementations

**Files:**
- Create: `api/Api/Modules/Ai/Providers/LlmContracts.cs` (`LlmMessage`, `LlmRequest`, `LlmToken`).
- Create: `api/Api/Modules/Ai/Providers/ILlmProvider.cs`.
- Create: `api/Api/Modules/Ai/Providers/ClaudeLlmProvider.cs`.
- Create: `api/Api/Modules/Ai/Providers/OpenAiLlmProvider.cs`.
- Create: `api/Api/Modules/Ai/Providers/ILlmProviderFactory.cs` + `LlmProviderFactory.cs`.
- Create tests: `api/Api.Tests/Ai/LlmProviderFactoryTests.cs`.

**Interfaces (Produces):**
- `record LlmMessage(string Role, string Content);` (`Role` = `"user"|"assistant"`).
- `record LlmRequest(string System, IReadOnlyList<LlmMessage> Messages);`
- `record LlmToken(string Text);`
- `interface ILlmProvider { string Name { get; } IAsyncEnumerable<LlmToken> StreamAsync(LlmRequest request, CancellationToken ct); }`
- `interface ILlmProviderFactory { ILlmProvider Get(string? providerName); }` — returns Claude when `providerName` is null/`"claude"`, OpenAI when `"openai"`; unknown → the default (`AiOptions.DefaultProvider`).

- [ ] **Step 1: Write the failing factory test.** `LlmProviderFactoryTests`: register a fake `ClaudeLlmProvider` and `OpenAiLlmProvider` (both implement `ILlmProvider` with distinct `Name`); assert `Get(null).Name == "claude"`, `Get("openai").Name == "openai"`, `Get("nonsense").Name == "claude"`.
- [ ] **Step 2:** Run it — FAIL (types not defined).
- [ ] **Step 3:** Write `LlmContracts.cs` + `ILlmProvider.cs` + `ILlmProviderFactory.cs`/`LlmProviderFactory.cs` (factory resolves the two providers from DI by `Name`).
- [ ] **Step 4:** Run the factory test — PASS.
- [ ] **Step 5:** Implement `ClaudeLlmProvider` using the official `Anthropic` SDK (verified surface, from the `claude-api` skill — `using Anthropic; using Anthropic.Models.Messages;`):
  - Construct once as a Singleton: `new AnthropicClient { ApiKey = <key from Key Vault config>, MaxRetries = 3 }` (SDK default is 2; set 3 per `api-llm-auth.md`).
  - `StreamAsync`: build `new MessageCreateParams { Model = "claude-opus-4-8", MaxTokens = <cap>, System = request.System, Messages = [ /* map LlmMessage → new MessageParam { Role = Role.User|Assistant, Content = m.Content } */ ] }`. **Default model is the exact string `claude-opus-4-8`** (the current most-capable Opus; never a bare `"claude"` — that 404s). `MaxTokens`: a named constant (short grounded answers ~4096; not invented — justify inline). Omit `Thinking` (keeps first-token latency low for streaming chat; revisit if answer quality needs it).
  - Stream: `await foreach (RawMessageStreamEvent ev in _client.Messages.CreateStreaming(parameters, ct)) { if (ev.TryPickContentBlockDelta(out var delta) && delta.Delta.TryPickText(out var text)) yield return new LlmToken(text.Text); }`. Pass `ct`. `Name => "claude"`. Never log request/response content.
- [ ] **Step 6:** Implement `OpenAiLlmProvider` using the official `OpenAI` SDK streaming chat API against the public OpenAI endpoint with the Key-Vault key. Same `StreamAsync` shape. `Name => "openai"`.
- [ ] **Step 7:** Register both providers + the factory in `Program.cs`. Load the Anthropic and OpenAI keys from Key Vault (the app already wires `DefaultAzureCredential`/Key Vault config at startup per `api-secrets.md` — read the secret via the existing configuration binding, not a hardcoded value). Client objects are Singletons; providers Singleton or Transient (stateless).
- [ ] **Step 8:** `dotnet test api/Api.Tests --filter LlmProviderFactory` — PASS. (Live provider calls are integration-only; unit tests mock `ILlmProvider`, never hit the network.)

### Task 1.3: Embedding service

**Files:**
- Create: `api/Api/Modules/Ai/Providers/IEmbeddingService.cs`.
- Create: `api/Api/Modules/Ai/Providers/AzureOpenAiEmbeddingService.cs`.
- Create tests: `api/Api.Tests/Ai/EmbeddingSerializationTests.cs`.

**Interfaces (Produces):**
- `interface IEmbeddingService { Task<float[]> EmbedAsync(string text, CancellationToken ct); Task<IReadOnlyList<float[]>> EmbedBatchAsync(IReadOnlyList<string> texts, CancellationToken ct); }`
- Static helper `EmbeddingBytes.ToBytes(float[]) : byte[]` and `EmbeddingBytes.FromBytes(byte[]) : float[]` (float32 little-endian round-trip) — the on-disk form for `dbo.RecordEmbedding` (Slice 2).

- [ ] **Step 1: Write the failing serialization test.** `EmbeddingSerializationTests`: `var v = new float[]{0.1f,-0.2f,3.14f}; Assert.Equal(v, EmbeddingBytes.FromBytes(EmbeddingBytes.ToBytes(v)));` and assert byte length `== v.Length * 4`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Write `EmbeddingBytes` (use `BinaryPrimitives`/`BitConverter` with a fixed endianness). Write `IEmbeddingService`.
- [ ] **Step 4:** Run the serialization test — PASS.
- [ ] **Step 5:** Implement `AzureOpenAiEmbeddingService` using `Azure.AI.OpenAI` with `DefaultAzureCredential` (Managed Identity — no key), endpoint + deployment from `AiOptions`. `EmbedAsync`/`EmbedBatchAsync` call the embeddings API and return `float[]`. Pass `ct`. Register in `Program.cs` (Singleton client). Never log the input text.
- [ ] **Step 6:** `dotnet test api/Api.Tests --filter Embedding` — PASS. (Live embedding calls are integration-only.)
- [ ] **Step 7: Ship-readiness build** — `dotnet build api/Api` clean.

### Task 1.4: Workspace AI config — off-switch + content-field allowlist

**Files:**
- Create: `database/migrations/<NNN>_AlterWorkspaces_AddAiConfig.sql` (+ `_Rollback.sql`) — `<NNN>` = next free (check `ls database/migrations/`).
- Modify: `api/Api/Data/Entities.cs` (Workspaces row: add `AiAssistEnabled bool`, `AiContentFieldAllowlist string`).
- Create: `api/Api/Modules/Ai/Config/AiConfigService.cs` + `IAiConfigService.cs` + `AiConfigDtos.cs`.
- Create: `api/Api/Modules/Ai/Config/AiConfigController.cs`.
- Create: `database/procedures/ai/usp_GetWorkspaceAiConfig.sql`, `usp_SetWorkspaceAiConfig.sql` (+ tSQLt tests under `database/tests/ai/`).
- Create tests: `api/Api.Tests/Ai/AiConfigControllerTests.cs`, `AiConfigServiceTests.cs`.

**Interfaces (Produces):**
- `record AiConfigDto(bool Enabled, IReadOnlyList<string> ContentFieldAllowlist);`
- `IAiConfigService.GetAsync(Guid workspaceId, ct) : Task<AiConfigDto>` and `SetAsync(Guid workspaceId, Guid actorUserId, AiConfigDto value, ct)`.
- REST: `GET /v1/workspaces/{workspaceId}/ai/config` (workspace member — needed so the SPA knows whether to show the Ask entry), `PUT /v1/workspaces/{workspaceId}/ai/config` (workspace admin only).
- The allowlist default (`["Name","Description","WorkflowDetails"]`) is a **column default**, so existing workspaces read it without a data migration.

- [ ] **Step 1:** Write the migration — add `AiAssistEnabled BIT NOT NULL DEFAULT 0` and `AiContentFieldAllowlist NVARCHAR(MAX) NOT NULL DEFAULT N'["Name","Description","WorkflowDetails"]'` to `dbo.Workspaces` (idempotent `IF NOT EXISTS ... sys.columns`). Rollback drops both columns. Mirror migration precedent for `DueSoonWindowDays`/`BenefitReviewOffsetDays`. Apply locally via `Invoke-Sqlcmd` against `AiSolutionsTrackerDev` (tSQLt is CI-only — see `[[dev-ship-gotchas]]`); verify rollback drops cleanly then re-apply forward.
- [ ] **Step 2:** Add the two properties to the Workspaces entity/row in `Entities.cs`.
- [ ] **Step 3:** Write `usp_GetWorkspaceAiConfig` (returns the two columns) and `usp_SetWorkspaceAiConfig` (`@AiAssistEnabled`, `@AllowlistJson`, `@ActorUserId`; validates the allowlist is a JSON array via `ISJSON`; stamps `UpdatedBy`/`UpdatedAt`). Header comment, `SET NOCOUNT/XACT_ABORT ON`, parameterized. tSQLt: `test_GetAiConfig_ReturnsDefaults`, `test_SetAiConfig_PersistsEnabledAndAllowlist`, `test_SetAiConfig_RejectsNonJsonAllowlist`.
- [ ] **Step 4:** Write `AiConfigService` (calls the procs via `FromSqlInterpolated`/`ExecuteSqlInterpolatedAsync`), parsing/serializing the allowlist JSON to `IReadOnlyList<string>`.
- [ ] **Step 5:** Write `AiConfigController` — GET (any workspace member), PUT (workspace admin — gate exactly as `FieldsController`/config controllers gate admin; `403` non-admin). Validate the allowlist is non-empty and every entry is a known field key on the Request object; `400` ValidationProblem otherwise. `Cache-Control: private, no-store`.
- [ ] **Step 6: xUnit** — `AiConfigServiceTests` (get-returns-default, set-round-trips, cancellation); `AiConfigControllerTests` (get happy, put happy admin, `403` non-admin, `400` empty/unknown-field allowlist).
- [ ] **Step 7:** `dotnet test api/Api.Tests` green.
- [ ] **Step 8: Ship** — `/dev-review-and-remediate` then `/dev-ship` (slice branch `slice/ai-foundation`).

---

# SLICE 2 — Embedding store + refresh sweep + permission-safe retrieval

**Read first:** `api-worker.md` (idempotency/scheduler discipline — the in-process analogue), `api-performance.md` (BackgroundService, no long work on the request thread, `IServiceScopeFactory`), `database-coding-standards.md`, `database-stored-procedures.md`, `api-data-access.md` (parameterization), `api-logging.md`/`api-pii-handling.md`; re-read `api/Api/Modules/Triggers/ScheduledTriggerService.cs` (+ its evaluator + options), `database/procedures/requests/usp_FindSimilarRequests.sql` (the permission-baked `WorkspaceMembership` join to reuse), and `database/procedures/requests/usp_GetRequestsForWorkspace.sql`.

### Task 2.1: `dbo.RecordEmbedding` schema

**Files:**
- Create: `database/migrations/<NNN>_CreateRecordEmbedding.sql` (+ rollback) — `<NNN>` = next free (`ls database/migrations/`).

**Interfaces (Produces):** table `dbo.RecordEmbedding`.

- [ ] **Step 1:** Columns — `EmbeddingId UNIQUEIDENTIFIER PK DEFAULT NEWID()`, `WorkspaceId UNIQUEIDENTIFIER NOT NULL` (FK → `Workspaces`, indexed), `ObjectType NVARCHAR(64) NOT NULL` (`'Request'` this cycle), `RecordId NVARCHAR(64) NOT NULL`, `Model NVARCHAR(64) NOT NULL`, `Dimensions INT NOT NULL`, `Vector VARBINARY(MAX) NOT NULL`, `ContentHash CHAR(64) NOT NULL` (SHA-256 hex of the allowlisted content that was embedded), `EmbeddedAt DATETIME2 NOT NULL`, + 6 audit columns + `IsDeleted BIT NOT NULL DEFAULT 0` + `DeletedAt DATETIME2 NULL`. Idempotent `IF NOT EXISTS`.
- [ ] **Step 2:** Indexes — unique filtered `UX_RecordEmbedding_Object_Record ON (ObjectType, RecordId) WHERE IsDeleted = 0`; `IX_RecordEmbedding_WorkspaceId`.
- [ ] **Step 3:** Rollback drops the table `IF EXISTS`.
- [ ] **Step 4:** Apply locally via `Invoke-Sqlcmd` on `AiSolutionsTrackerDev`; verify rollback + re-apply.

### Task 2.2: EF entity + embedding store

**Files:**
- Modify: `api/Api/Data/Entities.cs` (`RecordEmbeddingRow`).
- Create: `api/Api/Modules/Ai/Retrieval/IRecordEmbeddingStore.cs` + `RecordEmbeddingStore.cs`.
- Create: `database/procedures/ai/usp_UpsertRecordEmbedding.sql`, `usp_GetRecordsNeedingEmbedding.sql` (+ tSQLt under `database/tests/ai/`).
- Create tests: `api/Api.Tests/Ai/RecordEmbeddingStoreTests.cs`.

**Interfaces (Produces):**
- `record EmbeddingCandidate(string RecordId, string ContentHash, string Content);` — a record whose current allowlisted content differs from (or has no) stored embedding.
- `IRecordEmbeddingStore.GetRecordsNeedingEmbeddingAsync(Guid workspaceId, string objectType, ct) : Task<IReadOnlyList<EmbeddingCandidate>>` — computes each candidate's current content + hash server-side and returns only rows whose hash differs from the stored `ContentHash` (or that have none).
- `IRecordEmbeddingStore.UpsertAsync(Guid workspaceId, string objectType, string recordId, string model, int dims, byte[] vector, string contentHash, DateTime embeddedAt, ct)`.

- [ ] **Step 1:** Add `RecordEmbeddingRow` matching the columns.
- [ ] **Step 2:** Write `usp_GetRecordsNeedingEmbedding` — for `ObjectType='Request'`, project each non-deleted Request's allowlisted content (concatenate the workspace's `AiContentFieldAllowlist` fields from `FieldValues` via `OPENJSON`/`JSON_VALUE`) and its `HASHBYTES('SHA2_256', ...)` hex, `LEFT JOIN dbo.RecordEmbedding e ON e.ObjectType='Request' AND e.RecordId=r.RecordId AND e.IsDeleted=0`, return rows where `e.EmbeddingId IS NULL OR e.ContentHash <> <computedHash>`. Header comment, parameterized on `@WorkspaceId`.
- [ ] **Step 3:** Write `usp_UpsertRecordEmbedding` — `MERGE` on `(ObjectType, RecordId)` (or update-then-insert) writing `Vector`, `ContentHash`, `Model`, `Dimensions`, `EmbeddedAt`, audit. Idempotent.
- [ ] **Step 4:** tSQLt — `test_GetRecordsNeedingEmbedding_ReturnsUnembedded`, `_ExcludesUnchangedHash`, `_ReturnsChangedHash`, `_ExcludesSoftDeleted`; `test_UpsertRecordEmbedding_InsertsThenUpdates`.
- [ ] **Step 5:** Write `RecordEmbeddingStore` calling the two procs (`FromSqlInterpolated`/`ExecuteSqlInterpolatedAsync`). xUnit with a test DB fixture (or proc-mock per existing store test patterns): round-trip upsert, needing-embedding filter, cancellation.
- [ ] **Step 6:** `dotnet test api/Api.Tests --filter RecordEmbeddingStore` — PASS.

### Task 2.3: Daily embedding refresh service

**Files:**
- Create: `api/Api/Modules/Ai/Embedding/EmbeddingRefreshOptions.cs` (`DailyHourLocal` default matching the Phase-3 sweep hour, `TickPollSeconds` default `300`, `BatchSize` default `16`).
- Create: `api/Api/Modules/Ai/Embedding/EmbeddingRefreshEvaluator.cs` (Scoped — one sweep).
- Create: `api/Api/Modules/Ai/Embedding/EmbeddingRefreshService.cs` (`BackgroundService`).
- Modify: `api/Api/Program.cs` (register options, evaluator, `AddHostedService<EmbeddingRefreshService>()`).
- Create tests: `api/Api.Tests/Ai/EmbeddingRefreshEvaluatorTests.cs`.

**Interfaces (Produces):** `EmbeddingRefreshEvaluator.RunSweepAsync(CancellationToken) : Task<EmbeddingSweepSummary>` where `record EmbeddingSweepSummary(int Evaluated, int Embedded, int Failed);`. Consumes `IRecordEmbeddingStore`, `IEmbeddingService`, `IAiConfigService` (only sweeps workspaces with `AiAssistEnabled = true`), `IClock`.

- [ ] **Step 1: Failing test.** `RunSweep_EnabledWorkspaceWithUnembeddedRecord_EmbedsAndUpserts`: arrange one AI-enabled workspace + one Request with no embedding (fake store returns one `EmbeddingCandidate`) + a fake `IEmbeddingService` returning a fixed vector; assert `UpsertAsync` called once with that vector + the candidate's hash, and summary `Embedded == 1`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement `RunSweepAsync`: for each AI-enabled workspace → `GetRecordsNeedingEmbeddingAsync` → batch (`BatchSize`) → `EmbedBatchAsync` → `UpsertAsync` per record with `IClock.UtcNow`. **Per-record try/continue** (a failing record increments `Failed`, never aborts the sweep — mirror `ScheduledTriggerService`). Pass `ct` throughout. Log counts + `DurationMs` + `OperationId` only — never the content.
- [ ] **Step 4:** Run the failing test — PASS.
- [ ] **Step 5: Discipline tests** — `DisabledWorkspace_Skipped`, `EmbedThrowsForOneRecord_ContinuesOthers_CountsFailed`, `NoCandidates_EmbedsNothing`, `Cancellation_ExitsWithoutEmbedding`.
- [ ] **Step 6:** Write `EmbeddingRefreshService` on the `ScheduledTriggerService` template: `PeriodicTimer(TickPollSeconds)`; each tick, once per day at/after `DailyHourLocal` (reuse the Phase-3 once-per-day guard pattern — a watermark or the existing sweep-log mechanism; do not re-embed multiple times a day), run `RunSweepAsync` in its own DI scope. Catch-and-continue; cancellation-clean.
- [ ] **Step 7:** Register in `Program.cs`. `dotnet test api/Api.Tests --filter EmbeddingRefresh` — PASS.

### Task 2.4: Permission-safe hybrid retriever

**Files:**
- Create: `database/procedures/ai/usp_GetRetrievalCandidates.sql` (+ tSQLt).
- Create: `api/Api/Modules/Ai/Retrieval/IRecordRetriever.cs` + `RecordRetriever.cs` + `Cosine.cs`.
- Create tests: `api/Api.Tests/Ai/RecordRetrieverTests.cs`, `CosineTests.cs`.

**Interfaces (Produces):**
- `record RetrievedRecord(string RecordId, string Title, double Score);`
- `IRecordRetriever.RetrieveAsync(Guid workspaceId, Guid userId, string query, float[] queryEmbedding, int topK, ct) : Task<IReadOnlyList<RetrievedRecord>>` — the **permission boundary**. Returns only records the user may see, ranked by hybrid score, capped at `topK`.
- `usp_GetRetrievalCandidates @WorkspaceId, @UserId, @Query` → candidate rows `(RecordId, Title, Vector VARBINARY(MAX), KeywordScore INT)` for **non-deleted, non-closed** Requests **the user is entitled to see** — the entitlement enforced by the same inner join on `WorkspaceMembership` used by `usp_FindSimilarRequests` (a non-member gets zero rows). `KeywordScore` reuses the LIKE token-overlap scoring from `usp_FindSimilarRequests`.

- [ ] **Step 1: Failing cosine test.** `CosineTests`: `Cosine.Similarity(new[]{1f,0f}, new[]{1f,0f}) == 1`, `... {0f,1f}) == 0`, `... {-1f,0f}) == -1` (tolerance). Then write `Cosine.Similarity(float[], float[]) : double` (dot / (‖a‖·‖b‖); guard zero-norm → 0).
- [ ] **Step 2:** Write `usp_GetRetrievalCandidates` — clone the `WorkspaceMembership` entitlement join + LIKE token-overlap scoring from `usp_FindSimilarRequests`, but return the candidate's stored `Vector` (join `dbo.RecordEmbedding`) and `KeywordScore` instead of a `TOP(n)` list; exclude closed/soft-deleted. Parameterized. Header comment.
- [ ] **Step 3: tSQLt** — `test_GetRetrievalCandidates_NonMemberGetsZeroRows` (**the permission invariant**), `_ReturnsMemberVisibleRecordsWithVector`, `_ExcludesClosed`, `_ExcludesSoftDeleted`.
- [ ] **Step 4: Failing retriever test.** `RecordRetrieverTests.Retrieve_RanksBySemanticThenKeyword_CapsAtTopK`: fake the candidate proc to return three records with known vectors + keyword scores; assert ordering by the hybrid score and that the result length == `topK`.
- [ ] **Step 5:** Implement `RecordRetriever.RetrieveAsync`: call `usp_GetRetrievalCandidates` (already permission-filtered), decode each `Vector` via `EmbeddingBytes.FromBytes`, compute `Cosine.Similarity(queryEmbedding, v)`, combine with a normalized keyword score into a hybrid rank (semantic-weighted; state the weight inline as a tunable constant with a one-line justification — not invented policy, just a starting blend), sort desc, take `topK`. Pass `ct`.
- [ ] **Step 6: Permission invariant test at the service layer** — `Retrieve_NonMember_ReturnsEmpty` (candidate proc returns zero → retriever returns empty; assert no exception, empty list). Plus cancellation test.
- [ ] **Step 7:** `dotnet test api/Api.Tests --filter "Retriever|Cosine"` — PASS.
- [ ] **Step 8: Ship** — `/dev-review-and-remediate` then `/dev-ship` (slice branch `slice/ai-retrieval`).

---

# SLICE 3 — Ask endpoint + UI

**Read first:** `api-streaming.md` (SSE format: `token`/`error`, plus our `citation` event; client-disconnect handling; no retry mid-stream), `api-llm-auth.md` (before-every-LLM-call sequence), `api-error-handling.md`, `api-validation.md`, `api-performance.md` (SSE section, `Cache-Control`), `api-pii-handling.md`; design rules `ai-streaming-and-perceived-latency.md`, `ai-trust-and-provenance.md` (citations, first-use disclosure), `ai-feedback-and-correction.md` (thumbs), `ai-prompting-affordances.md` (empty state), `ai-uncertainty-and-errors.md` ("no records" answer), `web-styling.md`, `web-component-architecture.md`, `web-testing.md`; re-read `app-shell-and-headers.md` (top-bar entry) and an existing feature folder (e.g. `web/src/features/triggers/` from Phase 3) for structure.

### Task 3.1: Conversation persistence schema + store

**Files:**
- Create: `database/migrations/<NNN>_CreateAiConversation.sql` (+ rollback), `<NNN+1>_CreateAiConversationMessage.sql` (+ rollback) — `<NNN>` = next free (`ls database/migrations/`).
- Modify: `api/Api/Data/Entities.cs` (`AiConversationRow`, `AiConversationMessageRow`).
- Create: `database/procedures/ai/usp_CreateAiConversation.sql`, `usp_AppendAiMessage.sql`, `usp_GetAiConversation.sql`, `usp_GetAiConversationsForUser.sql` (+ tSQLt).
- Create: `api/Api/Modules/Ai/Chat/IAiConversationStore.cs` + `AiConversationStore.cs`.
- Create tests: `api/Api.Tests/Ai/AiConversationStoreTests.cs`.

**Interfaces (Produces):**
- `dbo.AiConversation` — `ConversationId PK`, `WorkspaceId` (FK, `IX`), `UserId UNIQUEIDENTIFIER NOT NULL` (`IX`), `Title NVARCHAR(200) NULL`, + 6 audit + soft-delete.
- `dbo.AiConversationMessage` — `MessageId PK`, `ConversationId` (FK, `IX`), `Role NVARCHAR(16) NOT NULL` (`CK` in `user`/`assistant`), `Content NVARCHAR(MAX) NOT NULL`, `CitationsJson NVARCHAR(MAX) NULL`, `Feedback NVARCHAR(16) NULL` (`up`/`down`/null), `CreatedAt DATETIME2 NOT NULL`, + 6 audit.
- `record AiMessage(Guid MessageId, string Role, string Content, string? CitationsJson, DateTime CreatedAt);`
- `IAiConversationStore` — `CreateAsync(wsId, userId, title, ct) : Task<Guid>`; `AppendAsync(conversationId, userId, role, content, citationsJson, ct) : Task<Guid>`; `LoadAsync(conversationId, userId, ct) : Task<IReadOnlyList<AiMessage>>` (returns messages only if the conversation belongs to `userId`, else throws not-found/forbidden — never disclose another user's conversation); `SetFeedbackAsync(messageId, userId, feedback, ct)`.

- [ ] **Step 1:** Write both migrations (tables above, idempotent + rollbacks; child `AiConversationMessage` FK → parent, indexed). Apply locally via `Invoke-Sqlcmd`; verify rollbacks child-before-parent, re-apply.
- [ ] **Step 2:** Add the two row types to `Entities.cs`.
- [ ] **Step 3:** Write the four procs — user-scoped (`@UserId` on every read/write; `usp_GetAiConversation` returns rows only when the conversation's `UserId` matches). Header comments, parameterized. tSQLt: `test_CreateAiConversation_InsertsOwnedByUser`, `test_AppendAiMessage_AppendsInOrder`, `test_GetAiConversation_OtherUser_ReturnsNothing` (**ownership invariant**), `test_SetFeedback_UpdatesMessage`.
- [ ] **Step 4:** Write `AiConversationStore` over the procs. xUnit: create→append→load round-trip, other-user-load-empty, feedback update, cancellation.
- [ ] **Step 5:** `dotnet test api/Api.Tests --filter AiConversationStore` — PASS.

### Task 3.2: Grounded prompt builder + citation parser

**Files:**
- Create: `api/Api/Modules/Ai/Chat/GroundedPromptBuilder.cs`.
- Create: `api/Api/Modules/Ai/Chat/CitationParser.cs`.
- Create tests: `api/Api.Tests/Ai/GroundedPromptBuilderTests.cs`, `CitationParserTests.cs`.

**Interfaces (Produces):**
- `record GroundedSource(int Marker, string RecordId, string Title);`
- `GroundedPromptBuilder.Build(string userQuery, IReadOnlyList<(string RecordId, string Title, string AllowlistedContent)> sources, IReadOnlyList<AiMessage> trimmedHistory) : (LlmRequest Request, IReadOnlyList<GroundedSource> Sources)` — numbers sources `[1..n]`, builds the system instruction ("answer **only** from the numbered records; cite each specific claim as `[cite:N]`; if the records do not answer, say you don't have records on that — never invent"), and includes only `AllowlistedContent` (the caller passes already-filtered content — the builder never sees client/matter/identity fields).
- `CitationParser.Extract(string assistantText, IReadOnlyList<GroundedSource> sources) : IReadOnlyList<GroundedSource>` — returns the sources whose `[cite:N]` markers actually appear in the text; **discards markers with no matching source** (hallucination guard).

- [ ] **Step 1: Failing tests.** `GroundedPromptBuilderTests.Build_NumbersSourcesAndIncludesOnlyProvidedContent` (assert the prompt contains `[1]`/`[2]`, the source content, and does **not** contain a not-provided string); `CitationParserTests.Extract_KeepsValidMarkers_DiscardsUnknown` (`"...[cite:1]...[cite:9]"` with 2 sources → only marker 1 returned).
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement both. The builder trims history to a small message/token budget (state the budget inline; start from the `api-conversation-history.md` trim defaults, not invented). The parser uses a `[cite:(\d+)]` regex.
- [ ] **Step 4:** Run — PASS.

### Task 3.3: Ask service + SSE controller

**Files:**
- Create: `api/Api/Modules/Ai/Chat/IAskService.cs` + `AskService.cs`.
- Create: `api/Api/Modules/Ai/Chat/AskController.cs`.
- Create: `api/Api/Modules/Ai/Chat/AskDtos.cs`.
- Create tests: `api/Api.Tests/Ai/AskServiceTests.cs`, `AskControllerTests.cs`.

**Interfaces (Produces):**
- `record AskEvent(string Type, string DataJson);` (`Type` ∈ `token`/`citation`/`error`).
- `IAskService.AskAsync(Guid workspaceId, Guid userId, Guid conversationId, string query, string? provider, ct) : IAsyncEnumerable<AskEvent>` — orchestrates: off-switch check → embed query → `IRecordRetriever.RetrieveAsync` → load allowlisted content of top-k via the **permission-filtered read path** (`IRequestsService.GetByIdAsync`) filtered to the workspace allowlist → `GroundedPromptBuilder.Build` → `ILlmProviderFactory.Get(provider).StreamAsync` → yield `token` events; buffer text, run `CitationParser` incrementally and yield `citation` events as markers complete → on completion persist the user+assistant turn via `IAiConversationStore` (with citations) → on provider failure yield one `error` event and stop (no mid-stream retry).
- REST: `POST /v1/workspaces/{workspaceId}/ai/conversations` (create; body `{ title? }`) → `{ conversationId }`; `GET /v1/workspaces/{workspaceId}/ai/conversations` (paginated, own only); `GET .../conversations/{id}` (own only) → messages; `POST .../conversations/{id}/ask` (**SSE**, body `{ query, provider? }`); `POST /v1/workspaces/{workspaceId}/ai/messages/{id}/feedback` (body `{ rating }`).

- [ ] **Step 1: Failing off-switch test.** `AskServiceTests.Ask_WhenWorkspaceDisabled_YieldsErrorAndNoProviderCall`: config disabled → assert a single `error` event and that `ILlmProviderFactory` was never invoked.
- [ ] **Step 2:** Run — FAIL. Implement the off-switch guard first.
- [ ] **Step 3: Failing grounding test.** `Ask_NoCandidates_StreamsHonestNoRecordsAnswer_NoCitations`: retriever returns empty → the prompt still runs but with zero sources; assert no `citation` events emitted (and, with a fake provider returning a "no records" string, that the turn persists). 
- [ ] **Step 4: Failing citation test.** `Ask_ProviderEmitsCiteMarker_EmitsCitationEvent`: fake provider streams `"See [cite:1]."`, one source → assert one `citation` event carrying that source's `RecordId`.
- [ ] **Step 5: Failing permission test.** `Ask_OnlyAllowlistedContentSentToProvider`: spy the `LlmRequest` passed to the fake provider; assert it contains the allowlisted `Description` text but **not** a seeded client/matter/identity value. (This is the data-floor gate.)
- [ ] **Step 6:** Implement `AskService.AskAsync` to satisfy Steps 1–5. Load top-k content strictly through `IRequestsService.GetByIdAsync` (re-checks permission) and project to the allowlist only. Never log prompt/response/content.
- [ ] **Step 7: Discipline tests** — `Ask_ProviderThrowsMidStream_YieldsErrorEventStops` (no rethrow, no retry), `Ask_Cancellation_StopsCleanly`, `Ask_PersistsTurnOnSuccess_SkipsPersistOnError`.
- [ ] **Step 8:** Write `AskController`. The `ask` action sets `Content-Type: text/event-stream`, `Cache-Control: private, no-store`, and writes each `AskEvent` as SSE frames (`event: {Type}\n` + `data: {DataJson}\n\n`, flush per event) — mirror `api-streaming.md`. Stop on `HttpContext.RequestAborted`. Conversation/list/feedback actions are ordinary JSON. `[Authorize]`; workspace-membership check; ProblemDetails on error.
- [ ] **Step 9: xUnit** `AskControllerTests` — create-conversation happy; list own-only; `ask` emits the mocked event sequence; feedback happy; non-member `403`; cancellation.
- [ ] **Step 10:** Register services in `Program.cs`. `dotnet test api/Api.Tests` green.

### Task 3.4: Workspace-admin AI config UI

**Files:**
- Create: `web/src/features/ai-config/` — `AiConfigPanel.tsx` (enabled toggle + content-field allowlist multi-select), `aiConfigModel.ts` (TanStack Query hooks for the Slice-1 config endpoints), `types.ts`, colocated `.test.tsx`.
- Modify: the workspace-admin settings nav/route to surface the panel (mirror how Phase 3 added `/admin/triggers`).

- [ ] **Step 1:** Build the panel — enabled toggle (design toggle, `data-ds`), allowlist multi-select seeded from the Request field catalog (default the three fields; never offer client/matter/identity fields as content — filter them out of the options), Save via `PUT .../ai/config`. Loading/error/empty/disabled states.
- [ ] **Step 2:** jest + jest-axe across states; userEvent save flow; query by role/label.

### Task 3.5: The "Ask" web surface

**Files:**
- Create: `web/src/features/ask/` — `AskPage.tsx`, `components/AskComposer.tsx`, `components/AnswerStream.tsx`, `components/CitationChip.tsx`, `components/SourceList.tsx`, `components/FirstUseDisclosure.tsx`, `askModel.ts` (conversation hooks + the SSE reader), `types.ts`, colocated `.test.tsx` for each.
- Modify: `web/src/App.tsx` (route `/ask`), the top bar (`app-shell-and-headers.md`) to add the Ask entry, shown only when `GET .../ai/config` reports enabled.
- Create: `shared/types/ai.ts` (DTOs mirrored from the API).

- [ ] **Step 1:** `askModel.ts` — a fetch-based SSE reader (`ReadableStream`/`EventSource`-style parsing of `event:`/`data:` frames) that surfaces `token`/`citation`/`error` to the component; abort on unmount (`AbortController`, per `web-component-architecture.md`).
- [ ] **Step 2:** `AnswerStream` — renders streaming tokens with a blinking cursor (`ai-streaming-and-perceived-latency.md`; respects `prefers-reduced-motion`), inline `CitationChip`s, an AI label + `FirstUseDisclosure` (dismissible, `ai-trust-and-provenance.md`).
- [ ] **Step 3:** `SourceList` — the ranked cited records beneath the answer, each linking to the record; `AskComposer` — the input with an empty-state prompt (`ai-prompting-affordances.md`) and Stop affordance during streaming; thumbs feedback wired to the feedback endpoint (`ai-feedback-and-correction.md`).
- [ ] **Step 4:** `AskPage` — composes the above; renders loading / streaming / answered / **no-matching-records** / error / **disabled** (AI off) states explicitly. `data-ds` on every design-system element; tokens only.
- [ ] **Step 5:** Top-bar entry + `/ask` route, gated on `ai/config.enabled`.
- [ ] **Step 6:** jest + jest-axe across every state (empty, streaming, answered, no-match, error, disabled). Mock the SSE reader; assert citation chips map to sources, the source list renders, feedback posts, and the disabled state hides the composer. Query by role/label.
- [ ] **Step 7:** `npm run test:coverage` green (≥ 80% floor).
- [ ] **Step 8: Ship** — `/dev-review-and-remediate` (includes design-fidelity + token gates) then `/dev-ship` (slice branch `slice/ai-ask`).

---

## Self-review

- **Spec coverage:** §3 in-scope items → foundation (Slice 1: 1.1–1.4), embedding store + sweep + retrieval (Slice 2: 2.1–2.4), Ask endpoint + conversation + config UI + web surface (Slice 3: 3.1–3.5). The four §14 guardrails: human-in-the-loop (no write path — Ask is read-only by construction), permission-respecting (2.4 candidate proc `WorkspaceMembership` join + 3.3 `GetByIdAsync` re-check + explicit invariant tests `test_GetRetrievalCandidates_NonMemberGetsZeroRows`, `Retrieve_NonMember_ReturnsEmpty`, `test_GetAiConversation_OtherUser_ReturnsNothing`), transparent (3.2 citation discipline + 3.5 AI label/disclosure/citations), off the critical path (1.4 default-OFF config + 3.3 off-switch gate + 3.4/3.5 enabled-gated surface). Data floor: 1.4 allowlist + 2.2 allowlisted-content hashing + 3.3 `Ask_OnlyAllowlistedContentSentToProvider` + never-log throughout. ✓
- **Placeholder scan:** no "TBD"/"handle edge cases"/"write tests for the above" — every task carries concrete files, interfaces, named tests, and code for the novel bits (cosine, serialization, factory, parser). The few tunables (retrieval blend weight, top-k, history trim budget) are explicitly flagged as "state inline, start from the existing default/family, justify" rather than invented — consistent with the no-invented-limits rule. ✓
- **Type consistency:** `LlmRequest`/`LlmToken`/`ILlmProvider`/`ILlmProviderFactory.Get`, `IEmbeddingService.EmbedAsync`/`EmbedBatchAsync`, `EmbeddingBytes.To/FromBytes`, `RetrievedRecord`/`IRecordRetriever.RetrieveAsync`, `EmbeddingCandidate`/`IRecordEmbeddingStore`, `GroundedSource`/`GroundedPromptBuilder.Build`/`CitationParser.Extract`, `AiMessage`/`IAiConversationStore`, `AskEvent`/`IAskService.AskAsync` — names/signatures consistent across the tasks that consume them. ✓
- **Migration numbering:** every DB task re-checks `ls database/migrations/` and takes the next free (094+), not an assumed number. ✓
- **Commit discipline:** no hand-`git commit`; each slice ends at `/dev-review-and-remediate` → `/dev-ship` on its named branch. ✓

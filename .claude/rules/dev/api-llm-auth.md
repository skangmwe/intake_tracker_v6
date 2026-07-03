# LLM Provider Routing and Auth — .claude/rules/dev/api-llm-auth.md
> See `api/CLAUDE.md` for pipeline overview

## Provider selection
The user selects `"openai"` or `"claude"` in the UI. Route via `ILlmProviderFactory`.
If no provider is explicitly specified, default to `"claude"`.
Both implement `StreamAsync(LlmRequest, CancellationToken) → IAsyncEnumerable<LlmToken>`.
Use the official SDKs — never call provider REST endpoints directly:
- **Claude** — the official `Anthropic` NuGet package (`dotnet add package Anthropic`) against Anthropic's public API. This is the SDK Anthropic ships and maintains. **Do not** use the community `Anthropic.SDK` (tghamm) package — different package, different maintainer, no built-in retry. The official package has built-in retry on `408`/`409`/`429`/`5xx` and connection errors; honors `Retry-After`. Default is 2 retries — set `MaxRetries = 3` to match the project default.
- **OpenAI alt provider (chat)** — official `OpenAI` NuGet package against the public OpenAI API, authenticated with an API key from Azure Key Vault. We deliberately keep chat on the public OpenAI API rather than Azure OpenAI so we can adopt new GPT model releases on day-of (Azure OpenAI typically lags by 2–8 weeks). The chat alt provider is a rarely-exercised path (Claude is the default), so the lower public-OpenAI rate-limit ceiling is acceptable.
- **Embeddings (separate code path, not an LLM provider)** — `Azure.AI.OpenAI` NuGet package against the project's Azure OpenAI Service (`text-embedding-3-large`, DataZoneStandard deployment), authenticated via Managed Identity. Embeddings live on Azure for the rate-limit ceiling and because the model is pinned for the index lifetime — model recency does not matter. See `document-pipeline/api-vector-search.md`.

For the general outbound-throttling rule (when an SDK doesn't handle throttling, when to use `AddStandardResilienceHandler()`, what is forbidden) see `api-performance.md`.

The Anthropic API key (default chat provider) and the public OpenAI API key (alt chat provider) are both loaded from Azure Key Vault via `DefaultAzureCredential` at startup. Azure OpenAI (used only for embeddings) authenticates via Managed Identity and has no key in Key Vault. Never hardcode or log either key.

## Routing paths
The threshold is the selected LLM model's context window limit (e.g. 128,000 tokens for Claude, 128,000 for GPT-4o). Do not use a configurable `LlmRouting:TokenThreshold`; instead read the limit directly from the provider's model metadata at runtime.
`doc.TokenCount` is produced by extraction — see `document-pipeline/api-extraction.md`.

- No document attached → Path 1: question only, go straight to LLM
- `doc.TokenCount <= modelContextLimit` → Path 2: send full extracted text to LLM
- `doc.TokenCount > modelContextLimit` → Path 3: send retrieved chunks (see `document-pipeline/api-vector-search.md`)

## Before every LLM call — all paths, all providers
1. Load conversation history via `ConversationHistorySkill.LoadAsync` — see `document-pipeline/api-conversation-history.md`.
2. Build the prompt. When `CitationsEnabled` is true, include per-line bounding box labels and instruct
   the LLM to embed `[cite:N]` markers inline and return a citations array — see `document-pipeline/api-citations.md` for format.
   When false, send plain text with no labels and no citation instructions.
3. Call `llm.StreamAsync(prompt, ct)` and yield each token to the response stream.
   For SSE format, event types, citation event timing, and client disconnection handling → `api-streaming.md`.

// A chat provider streams model tokens for a LlmRequest. Implementations wrap an official
// SDK (Claude via `Anthropic`, OpenAI via `OpenAI`) and never log request/response content
// (api-pii-handling.md, api-logging.md). Selected at runtime by ILlmProviderFactory.

namespace McDermott.AiTracker.Api.Modules.Ai.Providers;

public interface ILlmProvider
{
    /// <summary>Stable provider key used for routing — "claude" or "openai".</summary>
    string Name { get; }

    IAsyncEnumerable<LlmToken> StreamAsync(LlmRequest request, CancellationToken ct);
}

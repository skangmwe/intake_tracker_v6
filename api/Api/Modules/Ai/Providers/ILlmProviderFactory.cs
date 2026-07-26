// Resolves the chat provider for a request. A null/blank/unknown provider name falls back
// to the configured default (AiOptions.DefaultProvider, "claude" per api-llm-auth.md).

namespace McDermott.AiTracker.Api.Modules.Ai.Providers;

public interface ILlmProviderFactory
{
    /// <summary>Returns the provider for <paramref name="providerName"/>; null/blank/unknown → the default.</summary>
    ILlmProvider Get(string? providerName);
}

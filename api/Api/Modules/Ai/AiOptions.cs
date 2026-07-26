// AI-assist layer configuration, bound from the "Ai" section via IOptions<T>
// (api-coding-standards.md — Configuration). Non-secret config only: endpoints,
// deployment/model names, the default provider. Secret material (the Anthropic API
// key and the public-OpenAI key) is loaded from Key Vault and injected into the SDK
// clients at registration time — it never lives on this options class (api-secrets.md).

namespace McDermott.AiTracker.Api.Modules.Ai;

public sealed class AiOptions
{
    public const string SectionName = "Ai";

    /// <summary>Default chat provider when a request doesn't specify one: "claude" (default) or "openai".
    /// Claude is the sanctioned default per api-llm-auth.md.</summary>
    public string DefaultProvider { get; set; } = "claude";

    /// <summary>Claude chat model. Default is the current most-capable Opus (the exact string, never a bare "claude").</summary>
    public string ClaudeChatModel { get; set; } = "claude-opus-4-8";

    /// <summary>OpenAI chat model for the alt provider — kept on public OpenAI to adopt new GPT releases day-of (api-llm-auth.md).</summary>
    public string OpenAiChatModel { get; set; } = "gpt-4o";

    /// <summary>Max output tokens per grounded chat answer. Answers are short and cited, so a small cap keeps latency and cost low.</summary>
    public int MaxOutputTokens { get; set; } = 4096;

    /// <summary>Azure OpenAI resource endpoint (e.g. https://{resource}.openai.azure.com/) used for embeddings.
    /// Non-secret; authenticated via Managed Identity, no key.</summary>
    public string AzureOpenAiEndpoint { get; set; } = string.Empty;

    /// <summary>Azure OpenAI deployment name for the embedding model.</summary>
    public string EmbeddingDeployment { get; set; } = string.Empty;

    /// <summary>Embedding model. Fixed for the index lifetime (api-vector-search.md).</summary>
    public string EmbeddingModel { get; set; } = "text-embedding-3-large";

    /// <summary>Embedding vector dimensionality. Set at index creation and immutable for text-embedding-3-large (3072).</summary>
    public int EmbeddingDimensions { get; set; } = 3072;
}

// Generates embedding vectors for record content and the live query. One model for the index
// lifetime (text-embedding-3-large), Azure OpenAI via Managed Identity — no key (api-vector-search.md,
// api-secrets.md). Never logs the input text.

namespace McDermott.AiTracker.Api.Modules.Ai.Providers;

public interface IEmbeddingService
{
    Task<float[]> EmbedAsync(string text, CancellationToken ct);

    Task<IReadOnlyList<float[]>> EmbedBatchAsync(IReadOnlyList<string> texts, CancellationToken ct);
}

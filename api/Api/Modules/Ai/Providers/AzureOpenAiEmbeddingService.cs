using Azure.AI.OpenAI;
using Azure.Identity;
using Microsoft.Extensions.Options;
using OpenAI.Embeddings;

namespace McDermott.AiTracker.Api.Modules.Ai.Providers;

/// <summary>
/// Embeddings via the project's Azure OpenAI deployment (text-embedding-3-large), authenticated
/// with Managed Identity — no key (api-vector-search.md, api-secrets.md). The client is built lazily
/// so an unconfigured endpoint never throws at startup / DI validation (Slice 1 never resolves this;
/// retrieval and the embedding sweep, Slice 2+, do).
/// </summary>
public sealed class AzureOpenAiEmbeddingService : IEmbeddingService
{
    private readonly Lazy<EmbeddingClient> _client;

    public AzureOpenAiEmbeddingService(IOptions<AiOptions> options)
    {
        var value = options.Value;
        _client = new Lazy<EmbeddingClient>(() =>
        {
            if (string.IsNullOrWhiteSpace(value.AzureOpenAiEndpoint))
            {
                throw new InvalidOperationException("Azure OpenAI endpoint is not configured (Ai:AzureOpenAiEndpoint).");
            }

            return new AzureOpenAIClient(new Uri(value.AzureOpenAiEndpoint), new DefaultAzureCredential())
                .GetEmbeddingClient(value.EmbeddingDeployment);
        });
    }

    public async Task<float[]> EmbedAsync(string text, CancellationToken ct)
    {
        var vectors = await EmbedBatchAsync(new[] { text }, ct).ConfigureAwait(false);
        return vectors[0];
    }

    public async Task<IReadOnlyList<float[]>> EmbedBatchAsync(IReadOnlyList<string> texts, CancellationToken ct)
    {
        var response = await _client.Value.GenerateEmbeddingsAsync(texts, cancellationToken: ct).ConfigureAwait(false);
        return response.Value.Select(embedding => embedding.ToFloats().ToArray()).ToList();
    }
}

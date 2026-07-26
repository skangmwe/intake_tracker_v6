using McDermott.AiTracker.Api.Modules.Ai.Providers;

namespace McDermott.AiTracker.Api.Modules.Ai.Retrieval;

/// <summary>
/// Hybrid retriever: fetch the caller's permission-filtered candidates (usp_GetRetrievalCandidates), score each
/// by a blend of semantic cosine and normalised keyword overlap, and return the top-k. The candidate proc is
/// the permission boundary — this class never widens it. Content/titles are never logged.
/// </summary>
public sealed class RecordRetriever : IRecordRetriever
{
    // Semantic-weighted blend: the vector match dominates, with the keyword score as a tie-breaker / recall
    // booster. A starting point (not a tuned policy) — kept as a named constant so it is a one-line change.
    private const double SemanticWeight = 0.75d;

    private readonly IRecordEmbeddingStore _store;

    public RecordRetriever(IRecordEmbeddingStore store)
    {
        _store = store;
    }

    public async Task<IReadOnlyList<RetrievedRecord>> RetrieveAsync(
        Guid workspaceId, Guid userId, string query, float[] queryEmbedding, int topK, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var candidates = await _store
            .GetRetrievalCandidatesAsync(workspaceId, userId, query, cancellationToken)
            .ConfigureAwait(false);

        if (candidates.Count == 0 || topK <= 0)
        {
            return Array.Empty<RetrievedRecord>();
        }

        // Normalise the keyword score across the candidate set so it sits in [0, 1] like the mapped cosine.
        var maxKeyword = candidates.Max(candidate => candidate.KeywordScore);

        var ranked = candidates
            .Select(candidate =>
            {
                var vector = EmbeddingBytes.FromBytes(candidate.Vector);
                var cosine = Cosine.Similarity(queryEmbedding, vector);
                // Map cosine [-1, 1] → [0, 1] so both signals share a scale before blending.
                var semantic = (cosine + 1d) / 2d;
                var keyword = maxKeyword > 0 ? candidate.KeywordScore / (double)maxKeyword : 0d;
                var score = (SemanticWeight * semantic) + ((1d - SemanticWeight) * keyword);
                return new RetrievedRecord(candidate.RecordId, candidate.Title, score);
            })
            .OrderByDescending(record => record.Score)
            .ThenBy(record => record.RecordId, StringComparer.Ordinal)
            .Take(topK)
            .ToList();

        return ranked;
    }
}

namespace McDermott.AiTracker.Api.Modules.Ai.Retrieval;

/// <summary>A retrieved record — a candidate the caller may see, ranked by the hybrid score. Title is
/// Confidential — never logged.</summary>
public sealed record RetrievedRecord(string RecordId, string Title, double Score);

/// <summary>
/// The permission-safe hybrid retriever. Returns only records the caller is entitled to see, ranked by a blend
/// of semantic (cosine) and keyword relevance, capped at <c>topK</c>. The permission boundary is the candidate
/// proc's WorkspaceMembership join — a non-member gets zero candidates, so zero retrieved records.
/// </summary>
public interface IRecordRetriever
{
    Task<IReadOnlyList<RetrievedRecord>> RetrieveAsync(
        Guid workspaceId, Guid userId, string query, float[] queryEmbedding, int topK, CancellationToken cancellationToken);
}

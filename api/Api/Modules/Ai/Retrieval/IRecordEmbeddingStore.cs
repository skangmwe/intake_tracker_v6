namespace McDermott.AiTracker.Api.Modules.Ai.Retrieval;

/// <summary>
/// A record whose current allowlisted content has no stored embedding, or whose content has changed
/// since it was last embedded (its SHA-256 <see cref="ContentHash"/> differs from the stored one).
/// <see cref="Content"/> is the concatenated allowlisted text to embed — Confidential, never logged.
/// </summary>
public sealed record EmbeddingCandidate(string RecordId, string ContentHash, string Content);

/// <summary>
/// A retrieval candidate — an embedded, open, workspace-visible record with its stored vector and keyword
/// score, as returned by the permission-filtered usp_GetRetrievalCandidates. <see cref="Vector"/> is the flat
/// float32 blob (decode via EmbeddingBytes). <see cref="Title"/> is Confidential — never logged.
/// </summary>
public sealed record RetrievalCandidate(string RecordId, string Title, byte[] Vector, int KeywordScore);

/// <summary>
/// The per-record embedding store — a thin scoped wrapper over the embedding + retrieval procs. DB behaviour is
/// covered by tSQLt (usp_GetRecordsNeedingEmbedding / usp_UpsertRecordEmbedding / usp_GetRetrievalCandidates),
/// so the interface exists to let the refresh evaluator's and retriever's orchestration be unit-tested with Moq
/// (AppDbContext / FromSqlRaw is not itself unit-mockable — the same seam as ITriggerGateway).
/// </summary>
public interface IRecordEmbeddingStore
{
    /// <summary>Candidates in <paramref name="workspaceId"/> for <paramref name="objectType"/> whose current
    /// allowlisted content differs from (or has no) stored embedding. Content + hash are computed server-side
    /// from the workspace's <c>AiContentFieldAllowlist</c> so the evaluator never re-implements the policy.</summary>
    Task<IReadOnlyList<EmbeddingCandidate>> GetRecordsNeedingEmbeddingAsync(
        Guid workspaceId, string objectType, CancellationToken cancellationToken);

    /// <summary>Upsert one record's embedding on <c>(ObjectType, RecordId)</c> — insert or replace the vector,
    /// hash, model, dims and timestamp. Idempotent.</summary>
    Task UpsertAsync(
        Guid workspaceId,
        string objectType,
        string recordId,
        string model,
        int dimensions,
        byte[] vector,
        string contentHash,
        DateTime embeddedAt,
        CancellationToken cancellationToken);

    /// <summary>The permission-filtered retrieval candidates for a caller — the embedded, open records they may
    /// see, each with its vector + keyword score. A non-member (or a caller who can see nothing) gets an empty
    /// list. This is the store-side of the permission boundary; the retriever ranks and caps the result.</summary>
    Task<IReadOnlyList<RetrievalCandidate>> GetRetrievalCandidatesAsync(
        Guid workspaceId, Guid userId, string query, CancellationToken cancellationToken);
}

/// <summary>EF binding row for usp_GetRecordsNeedingEmbedding (keyless — registered via HasNoKey). Mapped to
/// <see cref="EmbeddingCandidate"/> in the store.</summary>
public sealed class EmbeddingCandidateRow
{
    public string RecordId { get; set; } = string.Empty;
    public string ContentHash { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
}

/// <summary>EF binding row for usp_GetRetrievalCandidates (keyless — registered via HasNoKey). Mapped to
/// <see cref="RetrievalCandidate"/> in the store.</summary>
public sealed class RetrievalCandidateRow
{
    public string RecordId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public byte[] Vector { get; set; } = Array.Empty<byte>();
    public int KeywordScore { get; set; }
}

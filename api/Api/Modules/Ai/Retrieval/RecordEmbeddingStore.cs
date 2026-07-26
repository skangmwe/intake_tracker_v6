using System.Data;
using McDermott.AiTracker.Api.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Ai.Retrieval;

/// <summary>
/// Scoped proc-gateway for the per-record embedding store. Reads go through keyless-row FromSqlRaw and the
/// upsert through ExecuteSqlRawAsync (api-data-access.md — procs, not EF LINQ CRUD; every dynamic value is a
/// SqlParameter). The sweep is system-run, so the audit actor is a fixed "system" tag.
/// </summary>
public sealed class RecordEmbeddingStore : IRecordEmbeddingStore
{
    private const string SystemActor = "system";

    private readonly AppDbContext _db;

    public RecordEmbeddingStore(AppDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<EmbeddingCandidate>> GetRecordsNeedingEmbeddingAsync(
        Guid workspaceId, string objectType, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<EmbeddingCandidateRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetRecordsNeedingEmbedding @WorkspaceId, @ObjectType",
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@ObjectType", objectType))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows
            .Select(row => new EmbeddingCandidate(row.RecordId, row.ContentHash, row.Content))
            .ToList();
    }

    public async Task UpsertAsync(
        Guid workspaceId,
        string objectType,
        string recordId,
        string model,
        int dimensions,
        byte[] vector,
        string contentHash,
        DateTime embeddedAt,
        CancellationToken cancellationToken) =>
        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_UpsertRecordEmbedding @WorkspaceId, @ObjectType, @RecordId, @Model, @Dimensions, @Vector, @ContentHash, @EmbeddedAt, @By",
            new[]
            {
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@ObjectType", objectType),
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@Model", model),
                new SqlParameter("@Dimensions", dimensions),
                new SqlParameter("@Vector", SqlDbType.VarBinary, -1) { Value = vector },
                new SqlParameter("@ContentHash", contentHash),
                new SqlParameter("@EmbeddedAt", embeddedAt),
                new SqlParameter("@By", SystemActor),
            },
            cancellationToken)
            .ConfigureAwait(false);

    public async Task<IReadOnlyList<RetrievalCandidate>> GetRetrievalCandidatesAsync(
        Guid workspaceId, Guid userId, string query, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<RetrievalCandidateRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetRetrievalCandidates @WorkspaceId, @UserId, @Query",
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@UserId", userId),
                new SqlParameter("@Query", query))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows
            .Select(row => new RetrievalCandidate(row.RecordId, row.Title, row.Vector, row.KeywordScore))
            .ToList();
    }
}

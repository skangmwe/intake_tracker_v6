// Drafts service (Slice 5 — owner-scoped pre-record state, data-model.md §Draft / BS §9.8). Drafts
// are personal and discardable — the sole exception to the no-hard-delete floor. Every operation is
// bound to @OwnerUserId in its stored procedure (the access boundary), so another user's draft is
// never returned, updated, or deleted. Drafts are pre-audit — no event is emitted. Body content is
// Confidential and never logged (api-pii-handling.md).

using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Requests;

public sealed record DraftSaveResult(DraftDto Draft, bool Created);

public interface IDraftsService
{
    Task<DraftSaveResult> SaveAsync(Guid workspaceId, Guid ownerUserId, DraftSaveRequest request, CancellationToken cancellationToken);

    Task<IReadOnlyList<DraftListRow>> ListAsync(Guid workspaceId, Guid ownerUserId, CancellationToken cancellationToken);

    Task<DraftDto?> GetAsync(Guid draftId, Guid ownerUserId, CancellationToken cancellationToken);

    Task<bool> DeleteAsync(Guid draftId, Guid ownerUserId, CancellationToken cancellationToken);
}

public sealed class DraftsService : IDraftsService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;

    public DraftsService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<DraftSaveResult> SaveAsync(
        Guid workspaceId, Guid ownerUserId, DraftSaveRequest request, CancellationToken cancellationToken)
    {
        var created = request.Id is null;
        var outputDraftId = new SqlParameter("@OutDraftId", System.Data.SqlDbType.UniqueIdentifier)
        {
            Direction = System.Data.ParameterDirection.Output,
        };

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_SaveDraft @DraftId, @OwnerUserId, @WorkspaceId, @ObjectType, @Title, @Body, @ActorUserId, @OutDraftId OUTPUT",
            new[]
            {
                new SqlParameter("@DraftId", (object?)request.Id ?? DBNull.Value),
                new SqlParameter("@OwnerUserId", ownerUserId),
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@ObjectType", request.ObjectType),
                new SqlParameter("@Title", (object?)request.Title ?? DBNull.Value),
                new SqlParameter("@Body", SerializeBody(request.Body)),
                new SqlParameter("@ActorUserId", ownerUserId.ToString()),
                outputDraftId,
            },
            cancellationToken).ConfigureAwait(false);

        var draftId = (Guid)outputDraftId.Value!;
        var dto = await GetAsync(draftId, ownerUserId, cancellationToken).ConfigureAwait(false);
        return new DraftSaveResult(dto!, created);
    }

    public async Task<IReadOnlyList<DraftListRow>> ListAsync(Guid workspaceId, Guid ownerUserId, CancellationToken cancellationToken)
    {
        var rows = await ReadDraftsAsync(
            "EXEC dbo.usp_GetDraftsForUser @OwnerUserId, @WorkspaceId, @ObjectType",
            cancellationToken,
            new SqlParameter("@OwnerUserId", ownerUserId),
            new SqlParameter("@WorkspaceId", workspaceId),
            new SqlParameter("@ObjectType", "Request")).ConfigureAwait(false);

        return rows
            .Select(row => new DraftListRow(row.DraftId, row.Title, row.ObjectType, DateTime.SpecifyKind(row.LastEditedAt, DateTimeKind.Utc)))
            .ToList();
    }

    public async Task<DraftDto?> GetAsync(Guid draftId, Guid ownerUserId, CancellationToken cancellationToken)
    {
        var rows = await ReadDraftsAsync(
            "EXEC dbo.usp_GetDraftById @DraftId, @OwnerUserId",
            cancellationToken,
            new SqlParameter("@DraftId", draftId),
            new SqlParameter("@OwnerUserId", ownerUserId)).ConfigureAwait(false);

        var row = rows.FirstOrDefault();
        return row is null ? null : MapDraft(row);
    }

    public async Task<bool> DeleteAsync(Guid draftId, Guid ownerUserId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<DraftDeleteRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_DeleteDraft @DraftId, @OwnerUserId",
                new SqlParameter("@DraftId", draftId),
                new SqlParameter("@OwnerUserId", ownerUserId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return rows.FirstOrDefault()?.Deleted > 0;
    }

    private async Task<IReadOnlyList<DraftRow>> ReadDraftsAsync(string sql, CancellationToken cancellationToken, params SqlParameter[] parameters) =>
        await _db.Set<DraftRow>().FromSqlRaw(sql, parameters).ToListAsync(cancellationToken).ConfigureAwait(false);

    private static DraftDto MapDraft(DraftRow row) => new(
        row.DraftId,
        row.WorkspaceId,
        row.ObjectType,
        row.Title,
        ParseBody(row.Body),
        DateTime.SpecifyKind(row.LastEditedAt, DateTimeKind.Utc));

    private static string SerializeBody(DraftBodyInput? body) =>
        JsonSerializer.Serialize(
            new
            {
                fields = body?.Fields ?? new Dictionary<string, JsonElement>(),
                related = body?.Related,
            },
            JsonOptions);

    private static DraftBodyDto ParseBody(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return new DraftBodyDto(new Dictionary<string, JsonElement>(), null);
        }

        try
        {
            var parsed = JsonSerializer.Deserialize<DraftBodyDto>(json, JsonOptions);
            return parsed ?? new DraftBodyDto(new Dictionary<string, JsonElement>(), null);
        }
        catch (JsonException)
        {
            return new DraftBodyDto(new Dictionary<string, JsonElement>(), null);
        }
    }
}

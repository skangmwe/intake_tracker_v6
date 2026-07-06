// Saved Views service (Slice 14 — api-contracts.md §15, module-boundaries.md §14). Owns view list /
// create / edit / delete. Views are presentation metadata — never widen access (BS §22.4). Every
// write goes through a stored procedure with each value bound as a SqlParameter (api-data-access.md).
// Authorization: a personal view is created/edited/deleted by its owner (Member+); a shared view by a
// WorkspaceAdmin. The list read enforces personal/shared visibility in the proc; the caller's
// workspace membership is verified by the controller before the list runs.

using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.SavedViews;

/// <summary>Outcome of a saved-view create/edit.</summary>
public enum SavedViewWriteOutcome
{
    Success,
    /// <summary>The caller may not create/edit this view (personal not owned, or shared without admin) — 403.</summary>
    Denied,
    /// <summary>The view id does not exist — 404 (a saved view is not access-hidden like a record).</summary>
    NotFound,
}

public sealed record SavedViewWriteResult(SavedViewWriteOutcome Outcome, SavedViewResponse? View = null);

public interface ISavedViewsService
{
    Task<IReadOnlyList<SavedViewResponse>> ListAsync(
        Guid workspaceId, string objectType, Guid userId, CancellationToken cancellationToken);

    Task<SavedViewWriteResult> CreateAsync(
        Guid workspaceId, SavedViewUpsertRequest request, Guid userId, CancellationToken cancellationToken);

    Task<SavedViewWriteResult> UpdateAsync(
        Guid savedViewId, SavedViewUpsertRequest request, Guid userId, CancellationToken cancellationToken);

    Task<SavedViewWriteOutcome> DeleteAsync(Guid savedViewId, Guid userId, CancellationToken cancellationToken);
}

public sealed class SavedViewsService : ISavedViewsService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly IAccessGuard _accessGuard;

    public SavedViewsService(AppDbContext db, IAccessGuard accessGuard)
    {
        _db = db;
        _accessGuard = accessGuard;
    }

    public async Task<IReadOnlyList<SavedViewResponse>> ListAsync(
        Guid workspaceId, string objectType, Guid userId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<SavedViewRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_ListSavedViews @WorkspaceId, @ObjectType, @UserId",
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@ObjectType", objectType),
                new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return rows.Select(MapRow).ToList();
    }

    public async Task<SavedViewWriteResult> CreateAsync(
        Guid workspaceId, SavedViewUpsertRequest request, Guid userId, CancellationToken cancellationToken)
    {
        var isShared = string.Equals(request.Scope, "shared", StringComparison.Ordinal);
        var requiredLevel = isShared ? WorkspaceLevel.WorkspaceAdmin : WorkspaceLevel.Member;
        if (!await _accessGuard.HasWorkspaceLevelAsync(userId, workspaceId, requiredLevel, cancellationToken).ConfigureAwait(false))
        {
            return new SavedViewWriteResult(SavedViewWriteOutcome.Denied);
        }

        var id = await UpsertAsync(null, workspaceId, request, userId, cancellationToken).ConfigureAwait(false);
        var view = await ReadByIdAsync(id, cancellationToken).ConfigureAwait(false);
        return new SavedViewWriteResult(SavedViewWriteOutcome.Success, view);
    }

    public async Task<SavedViewWriteResult> UpdateAsync(
        Guid savedViewId, SavedViewUpsertRequest request, Guid userId, CancellationToken cancellationToken)
    {
        var existing = await ReadRowAsync(savedViewId, cancellationToken).ConfigureAwait(false);
        if (existing is null)
        {
            return new SavedViewWriteResult(SavedViewWriteOutcome.NotFound);
        }

        // Writing a shared view (currently shared OR becoming shared) needs WorkspaceAdmin; a personal
        // view is editable only by its owner. A user cannot promote their own personal view to shared
        // without the admin level, and cannot edit another user's personal view.
        if (!await CanWriteAsync(existing, request.Scope, userId, cancellationToken).ConfigureAwait(false))
        {
            return new SavedViewWriteResult(SavedViewWriteOutcome.Denied);
        }

        var id = await UpsertAsync(savedViewId, existing.WorkspaceId, request, existing.OwnerUserId, cancellationToken).ConfigureAwait(false);
        var view = await ReadByIdAsync(id, cancellationToken).ConfigureAwait(false);
        return new SavedViewWriteResult(SavedViewWriteOutcome.Success, view);
    }

    public async Task<SavedViewWriteOutcome> DeleteAsync(Guid savedViewId, Guid userId, CancellationToken cancellationToken)
    {
        var existing = await ReadRowAsync(savedViewId, cancellationToken).ConfigureAwait(false);
        if (existing is null)
        {
            return SavedViewWriteOutcome.NotFound;
        }

        if (!await CanWriteAsync(existing, existing.Scope, userId, cancellationToken).ConfigureAwait(false))
        {
            return SavedViewWriteOutcome.Denied;
        }

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_DeleteSavedView @SavedViewId, @ActorUserId",
            new SqlParameter("@SavedViewId", savedViewId),
            new SqlParameter("@ActorUserId", userId.ToString()))
            .ConfigureAwait(false);
        return SavedViewWriteOutcome.Success;
    }

    private async Task<bool> CanWriteAsync(
        SavedViewRow existing, string? targetScope, Guid userId, CancellationToken cancellationToken)
    {
        var touchesShared = string.Equals(existing.Scope, "shared", StringComparison.Ordinal)
            || string.Equals(targetScope, "shared", StringComparison.Ordinal);
        if (touchesShared)
        {
            return await _accessGuard.HasWorkspaceLevelAsync(userId, existing.WorkspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken).ConfigureAwait(false);
        }

        return existing.OwnerUserId == userId;
    }

    private async Task<Guid> UpsertAsync(
        Guid? savedViewId, Guid workspaceId, SavedViewUpsertRequest request, Guid ownerUserId, CancellationToken cancellationToken)
    {
        var outParameter = new SqlParameter("@OutSavedViewId", System.Data.SqlDbType.UniqueIdentifier)
        {
            Direction = System.Data.ParameterDirection.Output,
        };

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_UpsertSavedView @SavedViewId, @WorkspaceId, @ObjectType, @Name, @Scope, @OwnerUserId, @IsDefault, @ColumnsJson, @FiltersJson, @SortJson, @ActorUserId, @OutSavedViewId OUTPUT",
            new[]
            {
                new SqlParameter("@SavedViewId", (object?)savedViewId ?? DBNull.Value),
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@ObjectType", request.ObjectType!),
                new SqlParameter("@Name", request.Name!),
                new SqlParameter("@Scope", request.Scope!),
                new SqlParameter("@OwnerUserId", ownerUserId),
                new SqlParameter("@IsDefault", request.IsDefault ?? false),
                new SqlParameter("@ColumnsJson", SerializeColumns(request.Columns)),
                new SqlParameter("@FiltersJson", SerializeFilters(request.Filters)),
                new SqlParameter("@SortJson", SerializeSort(request.Sort)),
                new SqlParameter("@ActorUserId", ownerUserId.ToString()),
                outParameter,
            },
            cancellationToken).ConfigureAwait(false);

        return (Guid)outParameter.Value!;
    }

    private async Task<SavedViewRow?> ReadRowAsync(Guid savedViewId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<SavedViewRow>()
            .FromSqlRaw("EXEC dbo.usp_GetSavedViewById @SavedViewId", new SqlParameter("@SavedViewId", savedViewId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return rows.FirstOrDefault();
    }

    private async Task<SavedViewResponse?> ReadByIdAsync(Guid savedViewId, CancellationToken cancellationToken)
    {
        var row = await ReadRowAsync(savedViewId, cancellationToken).ConfigureAwait(false);
        return row is null ? null : MapRow(row);
    }

    private static SavedViewResponse MapRow(SavedViewRow row) => new(
        Id: row.SavedViewId,
        WorkspaceId: row.WorkspaceId,
        ObjectType: row.ObjectType,
        Name: row.Name,
        Scope: row.Scope,
        IsDefault: row.IsDefault,
        Columns: ParseColumns(row.ColumnsJson),
        Filters: ParseFilters(row.FiltersJson),
        Sort: ParseSort(row.SortJson),
        OwnerUserId: row.OwnerUserId,
        CreatedBy: row.CreatedBy,
        CreatedAt: DateTime.SpecifyKind(row.CreatedAt, DateTimeKind.Utc),
        UpdatedAt: DateTime.SpecifyKind(row.UpdatedAt, DateTimeKind.Utc));

    private static string SerializeColumns(IReadOnlyList<string>? columns) =>
        JsonSerializer.Serialize(columns ?? Array.Empty<string>(), JsonOptions);

    private static string SerializeFilters(Dictionary<string, JsonElement>? filters) =>
        JsonSerializer.Serialize(filters ?? new Dictionary<string, JsonElement>(), JsonOptions);

    private static string SerializeSort(IReadOnlyList<SortSpec>? sort)
    {
        var entries = (sort ?? Array.Empty<SortSpec>())
            .Where(spec => !string.IsNullOrWhiteSpace(spec.Column))
            .Select(spec => new
            {
                column = spec.Column,
                direction = string.Equals(spec.Direction, "desc", StringComparison.OrdinalIgnoreCase) ? "desc" : "asc",
            });
        return JsonSerializer.Serialize(entries, JsonOptions);
    }

    private static IReadOnlyList<string> ParseColumns(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return Array.Empty<string>();
        }

        try
        {
            return JsonSerializer.Deserialize<List<string>>(json, JsonOptions) ?? new List<string>();
        }
        catch (JsonException)
        {
            return Array.Empty<string>();
        }
    }

    private static IReadOnlyDictionary<string, JsonElement> ParseFilters(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return new Dictionary<string, JsonElement>();
        }

        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json, JsonOptions)
                ?? new Dictionary<string, JsonElement>();
        }
        catch (JsonException)
        {
            return new Dictionary<string, JsonElement>();
        }
    }

    private static IReadOnlyList<SavedViewSortEntry> ParseSort(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return Array.Empty<SavedViewSortEntry>();
        }

        try
        {
            var entries = JsonSerializer.Deserialize<List<SavedViewSortEntry>>(json, JsonOptions);
            return entries ?? new List<SavedViewSortEntry>();
        }
        catch (JsonException)
        {
            return Array.Empty<SavedViewSortEntry>();
        }
    }
}

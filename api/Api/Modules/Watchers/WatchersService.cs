// Watchers service (Slice 12 — api-contracts.md §10). Owns per-record subscriptions. Access is
// resolved the same way as Comments: usp_GetRequestByIdForUser resolves the caller's side of the
// record (null → the caller cannot see it → 403, never 404, per BS §22.6) and yields the WorkspaceId
// the subscription lives on. Subscribing/unsubscribing another user requires WorkspaceAdmin; the
// prototype card only ever toggles the caller's own subscription. The procs also gate on membership
// (defense in depth). No PII is logged — DisplayName is carried for the card only (api-logging.md).

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Watchers;

public enum WatcherOutcome
{
    Ok,
    Forbidden,
}

public interface IWatchersService
{
    /// <summary>The record's watchers + the caller's own state. Null when the caller cannot see the record (→ 403).</summary>
    Task<WatcherListDto?> GetAsync(string recordId, Guid userId, CancellationToken cancellationToken);

    /// <summary>Subscribe a user (self, or another when the caller is WorkspaceAdmin). Idempotent.</summary>
    Task<WatcherOutcome> AddAsync(string recordId, Guid? targetUserId, Guid actorUserId, CancellationToken cancellationToken);

    /// <summary>Unsubscribe a user (self, or another when the caller is WorkspaceAdmin). Idempotent.</summary>
    Task<WatcherOutcome> RemoveAsync(string recordId, Guid targetUserId, Guid actorUserId, CancellationToken cancellationToken);
}

public sealed class WatchersService : IWatchersService
{
    private readonly AppDbContext _db;
    private readonly IAccessGuard _accessGuard;

    public WatchersService(AppDbContext db, IAccessGuard accessGuard)
    {
        _db = db;
        _accessGuard = accessGuard;
    }

    public async Task<WatcherListDto?> GetAsync(string recordId, Guid userId, CancellationToken cancellationToken)
    {
        var row = await ReadRecordAsync(recordId, userId, cancellationToken).ConfigureAwait(false);
        if (row is null)
        {
            return null;
        }

        var watchers = await _db.Set<WatcherListRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetWatchers @RecordId, @WorkspaceId, @UserId",
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@WorkspaceId", row.WorkspaceId),
                new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var items = watchers
            .Select(watcher => new WatcherListItemDto(
                watcher.UserId,
                watcher.DisplayName,
                DateTime.SpecifyKind(watcher.SubscribedAt, DateTimeKind.Utc)))
            .ToList();

        var isWatching = items.Any(item => item.UserId == userId);
        return new WatcherListDto(items, isWatching);
    }

    public async Task<WatcherOutcome> AddAsync(
        string recordId, Guid? targetUserId, Guid actorUserId, CancellationToken cancellationToken)
    {
        var row = await ReadRecordAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (row is null)
        {
            return WatcherOutcome.Forbidden;
        }

        var target = targetUserId ?? actorUserId;
        if (target != actorUserId &&
            !await _accessGuard.HasWorkspaceLevelAsync(actorUserId, row.WorkspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken).ConfigureAwait(false))
        {
            return WatcherOutcome.Forbidden;
        }

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_AddWatcher @RecordId, @WorkspaceId, @TargetUserId, @ActorUserId",
            new[]
            {
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@WorkspaceId", row.WorkspaceId),
                new SqlParameter("@TargetUserId", target),
                new SqlParameter("@ActorUserId", actorUserId),
            },
            cancellationToken).ConfigureAwait(false);

        return WatcherOutcome.Ok;
    }

    public async Task<WatcherOutcome> RemoveAsync(
        string recordId, Guid targetUserId, Guid actorUserId, CancellationToken cancellationToken)
    {
        var row = await ReadRecordAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (row is null)
        {
            return WatcherOutcome.Forbidden;
        }

        if (targetUserId != actorUserId &&
            !await _accessGuard.HasWorkspaceLevelAsync(actorUserId, row.WorkspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken).ConfigureAwait(false))
        {
            return WatcherOutcome.Forbidden;
        }

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_RemoveWatcher @RecordId, @WorkspaceId, @TargetUserId, @ActorUserId",
            new[]
            {
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@WorkspaceId", row.WorkspaceId),
                new SqlParameter("@TargetUserId", targetUserId),
                new SqlParameter("@ActorUserId", actorUserId),
            },
            cancellationToken).ConfigureAwait(false);

        return WatcherOutcome.Ok;
    }

    private async Task<RequestRow?> ReadRecordAsync(string recordId, Guid userId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<RequestRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetRequestByIdForUser @RecordId, @UserId",
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return rows.FirstOrDefault();
    }
}

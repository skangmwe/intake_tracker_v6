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

    /// <summary>
    /// Slice 26 — sparse patch of the caller's own record-scoped state: <c>isWatching</c> routes
    /// through Add/Remove and the five preference booleans route through
    /// <c>usp_UpsertWatcherPreference</c>. Returns the refreshed list (or forbidden).
    /// </summary>
    Task<(WatcherOutcome Outcome, WatcherListDto? List)> PatchMineAsync(
        string recordId, WatcherPreferencesPatchRequest request, Guid actorUserId, CancellationToken cancellationToken);
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
                DateTime.SpecifyKind(watcher.SubscribedAt, DateTimeKind.Utc),
                // Slice 26 — the projection returns null for every row except the caller's own; the
                // proc's CASE WHEN w.UserId = @User guard scopes the preference booleans, so no
                // caller-side filtering is required. The record data structure enforces the privacy
                // floor at the DB boundary.
                watcher.NotifyGateDecisions,
                watcher.NotifyStatusChanges,
                watcher.NotifyTaskSignoffs,
                watcher.NotifySlaAndDueDateReminders,
                watcher.NotifyMentionsAndComments))
            .ToList();

        var isWatching = items.Any(item => item.UserId == userId);

        // Slice 26 prototype reconciliation — the caller's own preferences, read INDEPENDENT of watch
        // state so the always-visible toggles read/persist even before the caller subscribes (the roster
        // projection above only carries them on an existing watcher row). Membership was already gated by
        // ReadRecordAsync above (null → 403), so this read is unconditional and yields exactly one row.
        var preferenceRows = await _db.Set<MyWatcherPreferencesRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetMyWatcherPreferences @RecordId, @WorkspaceId, @UserId",
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@WorkspaceId", row.WorkspaceId),
                new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        var preferenceRow = preferenceRows.FirstOrDefault();
        var myPreferences = new WatcherPreferencesDto(
            preferenceRow?.NotifyGateDecisions ?? true,
            preferenceRow?.NotifyStatusChanges ?? true,
            preferenceRow?.NotifyTaskSignoffs ?? true,
            preferenceRow?.NotifySlaAndDueDateReminders ?? true,
            preferenceRow?.NotifyMentionsAndComments ?? true);

        return new WatcherListDto(items, isWatching, myPreferences);
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

    public async Task<(WatcherOutcome Outcome, WatcherListDto? List)> PatchMineAsync(
        string recordId, WatcherPreferencesPatchRequest request, Guid actorUserId, CancellationToken cancellationToken)
    {
        // Resolve the record's side / workspace first — a caller who can't see the record is 403
        // (never disclose existence, BS §22.6). PatchMine only ever touches the caller's own state
        // so no WorkspaceAdmin escalation path is required.
        var row = await ReadRecordAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (row is null)
        {
            return (WatcherOutcome.Forbidden, null);
        }

        // isWatching routes through the presence table (Add/Remove) — the addendum keeps subscribe /
        // unsubscribe on dbo.Watchers, preferences on the new sparse table (D4). Ordering matters:
        // when a caller unsubscribes AND changes preferences in the same PATCH, we still upsert the
        // preferences so they're preserved for a later re-subscribe (Slice 26 §D4 rule).
        if (request.IsWatching == true)
        {
            await _db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_AddWatcher @RecordId, @WorkspaceId, @TargetUserId, @ActorUserId",
                new[]
                {
                    new SqlParameter("@RecordId", recordId),
                    new SqlParameter("@WorkspaceId", row.WorkspaceId),
                    new SqlParameter("@TargetUserId", actorUserId),
                    new SqlParameter("@ActorUserId", actorUserId),
                },
                cancellationToken).ConfigureAwait(false);
        }
        else if (request.IsWatching == false)
        {
            await _db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_RemoveWatcher @RecordId, @WorkspaceId, @TargetUserId, @ActorUserId",
                new[]
                {
                    new SqlParameter("@RecordId", recordId),
                    new SqlParameter("@WorkspaceId", row.WorkspaceId),
                    new SqlParameter("@TargetUserId", actorUserId),
                    new SqlParameter("@ActorUserId", actorUserId),
                },
                cancellationToken).ConfigureAwait(false);
        }

        if (HasPreferenceEdit(request))
        {
            await _db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_UpsertWatcherPreference @RecordId, @WorkspaceId, @UserId, " +
                "@SetNotifyGateDecisions, @NotifyGateDecisions, " +
                "@SetNotifyStatusChanges, @NotifyStatusChanges, " +
                "@SetNotifyTaskSignoffs, @NotifyTaskSignoffs, " +
                "@SetNotifySlaAndDueDateReminders, @NotifySlaAndDueDateReminders, " +
                "@SetNotifyMentionsAndComments, @NotifyMentionsAndComments",
                new[]
                {
                    new SqlParameter("@RecordId", recordId),
                    new SqlParameter("@WorkspaceId", row.WorkspaceId),
                    new SqlParameter("@UserId", actorUserId),
                    new SqlParameter("@SetNotifyGateDecisions", request.NotifyGateDecisions.HasValue),
                    new SqlParameter("@NotifyGateDecisions", request.NotifyGateDecisions ?? true),
                    new SqlParameter("@SetNotifyStatusChanges", request.NotifyStatusChanges.HasValue),
                    new SqlParameter("@NotifyStatusChanges", request.NotifyStatusChanges ?? true),
                    new SqlParameter("@SetNotifyTaskSignoffs", request.NotifyTaskSignoffs.HasValue),
                    new SqlParameter("@NotifyTaskSignoffs", request.NotifyTaskSignoffs ?? true),
                    new SqlParameter("@SetNotifySlaAndDueDateReminders", request.NotifySlaAndDueDateReminders.HasValue),
                    new SqlParameter("@NotifySlaAndDueDateReminders", request.NotifySlaAndDueDateReminders ?? true),
                    new SqlParameter("@SetNotifyMentionsAndComments", request.NotifyMentionsAndComments.HasValue),
                    new SqlParameter("@NotifyMentionsAndComments", request.NotifyMentionsAndComments ?? true),
                },
                cancellationToken).ConfigureAwait(false);
        }

        var refreshed = await GetAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        return refreshed is null ? (WatcherOutcome.Forbidden, null) : (WatcherOutcome.Ok, refreshed);
    }

    /// <summary>Pure — true when the patch touches at least one of the five preferences. Unit-testable.</summary>
    public static bool HasPreferenceEdit(WatcherPreferencesPatchRequest request) =>
        request.NotifyGateDecisions.HasValue
        || request.NotifyStatusChanges.HasValue
        || request.NotifyTaskSignoffs.HasValue
        || request.NotifySlaAndDueDateReminders.HasValue
        || request.NotifyMentionsAndComments.HasValue;

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

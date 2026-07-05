// Notifications service (Slice 12 — api-contracts.md §13). Owns the bell feed + per-user read state.
// Every read/write is caller-scoped (@UserId) inside the proc, so there is no cross-user disclosure
// and no record-access join is needed — a notification only exists because the fan-out already
// resolved the caller as a legitimate target. Marking someone else's notification read returns
// found=false → the API answers 403 without disclosing that it exists (BS §22.6). Summaries are
// built server-side from record id + category — no PII is logged (api-pii-handling.md).

using System.Data;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Requests;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Notifications;

public interface INotificationsService
{
    /// <summary>The caller's paginated bell feed (newest first).</summary>
    Task<PaginatedResponse<NotificationDto>> QueryAsync(Guid userId, NotificationQuery query, CancellationToken cancellationToken);

    /// <summary>The caller's unread count across all their workspaces (bell badge).</summary>
    Task<int> GetUnreadCountAsync(Guid userId, CancellationToken cancellationToken);

    /// <summary>Mark one notification read. False when the id is not the caller's (→ 403). Idempotent.</summary>
    Task<bool> MarkReadAsync(Guid notificationId, Guid userId, CancellationToken cancellationToken);

    /// <summary>Mark all the caller's notifications read. Idempotent.</summary>
    Task MarkAllReadAsync(Guid userId, CancellationToken cancellationToken);
}

public sealed class NotificationsService : INotificationsService
{
    private readonly AppDbContext _db;

    public NotificationsService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<PaginatedResponse<NotificationDto>> QueryAsync(
        Guid userId, NotificationQuery query, CancellationToken cancellationToken)
    {
        var page = query.Page < 1 ? 1 : query.Page;
        var pageSize = query.PageSize < 1 ? 20 : query.PageSize > 100 ? 100 : query.PageSize;

        var rows = await _db.Set<NotificationRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_QueryNotifications @UserId, @Page, @PageSize, @UnreadOnly",
                new SqlParameter("@UserId", userId),
                new SqlParameter("@Page", page),
                new SqlParameter("@PageSize", pageSize),
                new SqlParameter("@UnreadOnly", query.UnreadOnly))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var items = rows.Select(Map).ToList();
        var totalCount = rows.Count > 0 ? rows[0].TotalCount : 0;
        return new PaginatedResponse<NotificationDto>(items, totalCount, page, pageSize);
    }

    public async Task<int> GetUnreadCountAsync(Guid userId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<UnreadCountRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetUnreadCount @UserId",
                new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return rows.FirstOrDefault()?.UnreadCount ?? 0;
    }

    public async Task<bool> MarkReadAsync(Guid notificationId, Guid userId, CancellationToken cancellationToken)
    {
        var foundParameter = new SqlParameter("@Found", SqlDbType.Bit)
        {
            Direction = ParameterDirection.Output,
        };

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_MarkNotificationRead @NotificationId, @UserId, @Found OUTPUT",
            new[]
            {
                new SqlParameter("@NotificationId", notificationId),
                new SqlParameter("@UserId", userId),
                foundParameter,
            },
            cancellationToken).ConfigureAwait(false);

        return foundParameter.Value is bool found && found;
    }

    public async Task MarkAllReadAsync(Guid userId, CancellationToken cancellationToken)
    {
        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_MarkAllNotificationsRead @UserId",
            new[] { new SqlParameter("@UserId", userId) },
            cancellationToken).ConfigureAwait(false);
    }

    private static NotificationDto Map(NotificationRow row) =>
        new(
            row.NotificationId,
            row.Category,
            row.RecordId,
            row.Summary,
            DateTime.SpecifyKind(row.CreatedAt, DateTimeKind.Utc),
            row.ReadAt is null ? null : DateTime.SpecifyKind(row.ReadAt.Value, DateTimeKind.Utc),
            row.SourceEventId);
}

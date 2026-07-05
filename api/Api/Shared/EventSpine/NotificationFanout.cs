// Persists per-user bell notifications through usp_FanOutNotification. Uses parameterized EXEC —
// every dynamic value is a SqlParameter (api-data-access.md: SQL-injection mandatory
// parameterization). Runs on the caller's DbContext/transaction so the notification rows commit
// atomically with the state change that emitted the event (mirrors AuditWriter). The proc itself
// no-ops on non-notifiable events, so this consumer runs for every emit without a pre-filter.

using McDermott.AiTracker.Api.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Shared.EventSpine;

public sealed class NotificationFanout : INotificationFanout
{
    private readonly AppDbContext _db;

    public NotificationFanout(AppDbContext db)
    {
        _db = db;
    }

    public async Task FanOutAsync(EventEnvelope envelope, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(envelope);

        var parameters = new[]
        {
            new SqlParameter("@EventId", envelope.EventId),
            new SqlParameter("@EventType", envelope.EventType),
            new SqlParameter("@WorkspaceId", envelope.WorkspaceId),
            new SqlParameter("@RecordId", (object?)envelope.RecordId ?? DBNull.Value),
            new SqlParameter("@ActorUserId", (object?)envelope.ActorUserId ?? DBNull.Value),
            new SqlParameter("@PayloadJson", (object?)envelope.PayloadJson ?? DBNull.Value),
            new SqlParameter("@EventAt", envelope.EventAt.UtcDateTime),
        };

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_FanOutNotification @EventId, @EventType, @WorkspaceId, @RecordId, @ActorUserId, @PayloadJson, @EventAt",
            parameters,
            ct).ConfigureAwait(false);
    }
}

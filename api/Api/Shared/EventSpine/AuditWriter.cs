// Persists the append-only audit row through usp_EmitAuditEntry. Uses parameterized
// EXEC — every dynamic value is a SqlParameter (api-data-access.md: SQL-injection
// mandatory parameterization). Runs on the caller's DbContext/transaction so the
// audit row commits atomically with the state change it records.

using McDermott.AiTracker.Api.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Shared.EventSpine;

public sealed class AuditWriter : IAuditWriter
{
    private readonly AppDbContext _db;

    public AuditWriter(AppDbContext db)
    {
        _db = db;
    }

    public async Task WriteAsync(EventEnvelope envelope, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(envelope);

        var parameters = new[]
        {
            new SqlParameter("@WorkspaceId", envelope.WorkspaceId),
            new SqlParameter("@EventType", envelope.EventType),
            new SqlParameter("@EventPayload", envelope.PayloadJson),
            new SqlParameter("@RecordId", (object?)envelope.RecordId ?? DBNull.Value),
            new SqlParameter("@ObjectType", DBNull.Value),
            new SqlParameter("@ActorUserId", (object?)envelope.ActorUserId ?? DBNull.Value),
            new SqlParameter("@EventAt", envelope.EventAt.UtcDateTime),
        };

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_EmitAuditEntry @WorkspaceId, @EventType, @EventPayload, @RecordId, @ObjectType, @ActorUserId, @EventAt",
            parameters,
            ct).ConfigureAwait(false);
    }
}

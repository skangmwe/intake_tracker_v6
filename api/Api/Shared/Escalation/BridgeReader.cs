// Reads the escalation-bridge inputs for a record (usp_GetBridgeForRecord). Lives in Shared/Escalation
// so both the Requests module (compose the DTO bridge block + enforce the PG-side crossing-field lock on
// PATCH) and the Escalation module can consume it without a module cycle — Escalation depends on Requests,
// not the other way around. Returns null when the record is not escalated or the caller can't see it.
// The mirror status STRING is derived read-time from the returned AiStage + hold/outcome (BS §6.4,
// slice-9 read-time-derivation decision) — no manual write path, nothing stored.

using McDermott.AiTracker.Api.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Shared.Escalation;

public interface IBridgeReader
{
    /// <summary>The bridge inputs for a record, or null when not escalated / not visible to the caller.</summary>
    Task<BridgeRow?> ReadAsync(string recordId, Guid userId, CancellationToken cancellationToken);
}

public sealed class BridgeReader : IBridgeReader
{
    private readonly AppDbContext _db;

    public BridgeReader(AppDbContext db) => _db = db;

    public async Task<BridgeRow?> ReadAsync(string recordId, Guid userId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<BridgeRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetBridgeForRecord @RecordId, @UserId",
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return rows.FirstOrDefault();
    }
}

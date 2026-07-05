// Reads the CrossingMap for an escalation event — the workspace's Request crossing fields ([S]),
// marked on FieldDefinition (Category='Crossing', BS §6.2). Only the Escalation module consumes this.
// The seed map is 1:1 same-key (CrossingToFieldKey = same key), read-only in R1 Phase 1; the
// propose/confirm admin editor is Phase 2 (slice 24). See shared-inventory.md 'crossing-map-reader'.

using McDermott.AiTracker.Api.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Shared.Escalation;

public interface ICrossingMapReader
{
    /// <summary>The Request crossing fields ([S]) for a workspace, in stable snapshot order.</summary>
    Task<IReadOnlyList<CrossingFieldRow>> GetCrossingFieldsAsync(Guid workspaceId, CancellationToken cancellationToken);
}

public sealed class CrossingMapReader : ICrossingMapReader
{
    private readonly AppDbContext _db;

    public CrossingMapReader(AppDbContext db) => _db = db;

    public async Task<IReadOnlyList<CrossingFieldRow>> GetCrossingFieldsAsync(
        Guid workspaceId, CancellationToken cancellationToken) =>
        await _db.Set<CrossingFieldRow>()
            .FromSqlRaw("EXEC dbo.usp_GetCrossingFields @WorkspaceId", new SqlParameter("@WorkspaceId", workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
}

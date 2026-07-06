// Crossing-map read (S35 — api-contracts §19, BS §6.2). Read-only in R1 Phase 1: the map is the
// seeded 1:1 PG→AI pairing read off FieldDefinition via usp_GetCrossingMap (there is no CrossingMap
// table until slice 24 — data-model.md). No write path here. Not a workspace-scoped read — the
// controller's Platform-admin AccessGuard is the only access check.

using McDermott.AiTracker.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.PlatformAdmin;

public interface ICrossingMapService
{
    Task<IReadOnlyList<CrossingMapRowResponse>> GetAsync(CancellationToken cancellationToken);
}

public sealed class CrossingMapService : ICrossingMapService
{
    private readonly AppDbContext _db;

    public CrossingMapService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<CrossingMapRowResponse>> GetAsync(CancellationToken cancellationToken)
    {
        var rows = await _db.Set<CrossingMapRow>()
            .FromSqlRaw("EXEC dbo.usp_GetCrossingMap")
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows
            .Select(row => new CrossingMapRowResponse(
                row.SourceFieldKey, row.SourceDisplayName, row.SourceFieldType,
                row.TargetFieldKey, row.TargetDisplayName, row.TargetFieldType))
            .ToList();
    }
}

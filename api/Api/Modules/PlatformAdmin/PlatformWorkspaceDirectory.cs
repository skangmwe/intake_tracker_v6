// Firm-wide workspace directory (S34 Relationships-tab picker). A single-table read over
// dbo.Workspaces — no joins, no aggregation — so it stays in EF Core rather than a stored procedure
// (api-data-access.md). Access is gated at the controller on Platform admin; the service trusts the
// controller has already gated the call.

using McDermott.AiTracker.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.PlatformAdmin;

public interface IPlatformWorkspaceDirectory
{
    /// <summary>Every non-deleted workspace, ordered by name — the firm-wide picker list.</summary>
    Task<IReadOnlyList<PlatformWorkspaceDto>> ListAsync(CancellationToken cancellationToken);
}

public sealed class PlatformWorkspaceDirectory : IPlatformWorkspaceDirectory
{
    private readonly AppDbContext _db;

    public PlatformWorkspaceDirectory(AppDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<PlatformWorkspaceDto>> ListAsync(CancellationToken cancellationToken)
    {
        return await _db.Workspaces
            .AsNoTracking()
            .Where(workspace => !workspace.IsDeleted)
            .OrderBy(workspace => workspace.Name)
            .Select(workspace => new PlatformWorkspaceDto(workspace.WorkspaceId, workspace.Name, workspace.Kind))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
    }
}

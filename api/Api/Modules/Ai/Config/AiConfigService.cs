using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Ai.Config;

/// <summary>
/// Reads/writes the two AI-config columns on dbo.Workspaces via EF Core (single-table, no joins —
/// api-data-access.md). The allowlist is stored as a JSON string and projected to a list here.
/// </summary>
public sealed class AiConfigService : IAiConfigService
{
    private readonly AppDbContext _db;
    private readonly IClock _clock;

    public AiConfigService(AppDbContext db, IClock clock)
    {
        _db = db;
        _clock = clock;
    }

    public async Task<AiConfigDto> GetAsync(Guid workspaceId, CancellationToken ct)
    {
        var row = await _db.Workspaces
            .AsNoTracking()
            .Where(workspace => workspace.WorkspaceId == workspaceId && !workspace.IsDeleted)
            .Select(workspace => new { workspace.AiAssistEnabled, workspace.AiContentFieldAllowlist })
            .SingleOrDefaultAsync(ct)
            .ConfigureAwait(false)
            ?? throw new KeyNotFoundException($"Workspace {workspaceId} not found.");

        return new AiConfigDto(row.AiAssistEnabled, AiContentAllowlist.Deserialize(row.AiContentFieldAllowlist));
    }

    public async Task<AiConfigDto> SetAsync(
        Guid workspaceId, Guid actorUserId, bool enabled, IReadOnlyList<string> allowlist, CancellationToken ct)
    {
        var workspace = await _db.Workspaces
            .SingleOrDefaultAsync(candidate => candidate.WorkspaceId == workspaceId && !candidate.IsDeleted, ct)
            .ConfigureAwait(false)
            ?? throw new KeyNotFoundException($"Workspace {workspaceId} not found.");

        workspace.AiAssistEnabled = enabled;
        workspace.AiContentFieldAllowlist = AiContentAllowlist.Serialize(allowlist);
        workspace.UpdatedBy = actorUserId.ToString();
        workspace.UpdatedAt = _clock.UtcNow.UtcDateTime;

        await _db.SaveChangesAsync(ct).ConfigureAwait(false);

        return new AiConfigDto(enabled, allowlist);
    }
}

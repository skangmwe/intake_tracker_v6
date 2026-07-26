namespace McDermott.AiTracker.Api.Modules.Ai.Config;

/// <summary>Reads and writes a workspace's AI-assist configuration (single-table on dbo.Workspaces).</summary>
public interface IAiConfigService
{
    Task<AiConfigDto> GetAsync(Guid workspaceId, CancellationToken ct);

    Task<AiConfigDto> SetAsync(
        Guid workspaceId, Guid actorUserId, bool enabled, IReadOnlyList<string> allowlist, CancellationToken ct);
}

namespace McDermott.AiTracker.Api.Modules.Ai.Config;

/// <summary>Reads and writes a workspace's AI-assist configuration (single-table on dbo.Workspaces).</summary>
public interface IAiConfigService
{
    Task<AiConfigDto> GetAsync(Guid workspaceId, CancellationToken ct);

    Task<AiConfigDto> SetAsync(
        Guid workspaceId, Guid actorUserId, bool enabled, IReadOnlyList<string> allowlist, CancellationToken ct);

    /// <summary>The ids of every workspace with AI-assist enabled (AiAssistEnabled = true, not soft-deleted).
    /// The embedding refresh sweep processes only these — a disabled workspace is never embedded.</summary>
    Task<IReadOnlyList<Guid>> GetEnabledWorkspaceIdsAsync(CancellationToken ct);
}

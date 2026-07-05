// Wire contracts for the Watchers module (Slice 12 — api-contracts.md §10). Property names serialize
// to camelCase (ASP.NET Core web defaults) so they mirror /shared/types/collaboration.ts exactly.
// DisplayName is shown in the roster only — never logged (api-logging.md).

namespace McDermott.AiTracker.Api.Modules.Watchers;

// ─── Responses ────────────────────────────────────────────────────────────────

/// <summary>One watcher for the record-detail card. Mirrors WatcherListItemDto in collaboration.ts.</summary>
public sealed record WatcherListItemDto(
    Guid UserId,
    string DisplayName,
    DateTime SubscribedAt);

/// <summary>The roster + the caller's own subscription state. Mirrors WatcherListDto in collaboration.ts.</summary>
public sealed record WatcherListDto(
    IReadOnlyList<WatcherListItemDto> Watchers,
    bool IsWatching);

// ─── Request bodies ─────────────────────────────────────────────────────────────

/// <summary>POST /records/{id}/watchers. userId defaults to the caller; naming another user requires
/// WorkspaceAdmin. Mirrors the { userId? } body in api-contracts.md §10.</summary>
public sealed class AddWatcherRequest
{
    public Guid? UserId { get; set; }
}

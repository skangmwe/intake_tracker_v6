// Wire contracts for the Watchers module (Slice 12 — api-contracts.md §10). Property names serialize
// to camelCase (ASP.NET Core web defaults) so they mirror /shared/types/collaboration.ts exactly.
// DisplayName is shown in the roster only — never logged (api-logging.md).

using System.Text.Json.Serialization;

namespace McDermott.AiTracker.Api.Modules.Watchers;

// ─── Responses ────────────────────────────────────────────────────────────────

/// <summary>
/// One watcher for the record-detail card. Mirrors WatcherListItemDto in collaboration.ts. Slice 26:
/// the caller's own row carries the five per-record preference booleans; other rows omit them (a
/// watcher never sees another watcher's preferences). Nulls are omitted from the wire so pre-v2
/// clients see no new fields.
/// </summary>
public sealed record WatcherListItemDto(
    Guid UserId,
    string DisplayName,
    DateTime SubscribedAt,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? NotifyGateDecisions = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? NotifyStatusChanges = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? NotifyTaskSignoffs = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? NotifySlaAndDueDateReminders = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? NotifyMentionsAndComments = null);

/// <summary>The caller's own effective notification preferences, always present (defaults all-true).
/// Slice 26 prototype reconciliation: drives the always-visible preference toggles independent of watch
/// state. Mirrors WatcherPreferences in collaboration.ts.</summary>
public sealed record WatcherPreferencesDto(
    bool NotifyGateDecisions,
    bool NotifyStatusChanges,
    bool NotifyTaskSignoffs,
    bool NotifySlaAndDueDateReminders,
    bool NotifyMentionsAndComments);

/// <summary>The roster + the caller's own subscription state + the caller's preferences. Mirrors
/// WatcherListDto in collaboration.ts.</summary>
public sealed record WatcherListDto(
    IReadOnlyList<WatcherListItemDto> Watchers,
    bool IsWatching,
    WatcherPreferencesDto MyPreferences);

// ─── Request bodies ─────────────────────────────────────────────────────────────

/// <summary>POST /records/{id}/watchers. userId defaults to the caller; naming another user requires
/// WorkspaceAdmin. Mirrors the { userId? } body in api-contracts.md §10.</summary>
public sealed class AddWatcherRequest
{
    public Guid? UserId { get; set; }
}

/// <summary>
/// Slice 26 — PATCH /records/{recordId}/watchers/me. Sparse: only present fields are updated.
/// <c>isWatching</c> routes through Add/Remove (via <c>Watchers</c>); the five preference booleans
/// route through <c>usp_UpsertWatcherPreference</c> (via <c>WatcherNotificationPreference</c>).
/// Mirrors WatcherPreferencesPatchRequest in collaboration.ts.
/// </summary>
public sealed class WatcherPreferencesPatchRequest
{
    public bool? IsWatching { get; set; }
    public bool? NotifyGateDecisions { get; set; }
    public bool? NotifyStatusChanges { get; set; }
    public bool? NotifyTaskSignoffs { get; set; }
    public bool? NotifySlaAndDueDateReminders { get; set; }
    public bool? NotifyMentionsAndComments { get; set; }
}

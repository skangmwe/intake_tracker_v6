// Wire DTOs for the trigger admin CRUD (slice: triggers-request-authoring, Task 2.1).

namespace McDermott.AiTracker.Api.Modules.Triggers;

/// <summary>One ANDed "when" clause: a field + comparator (+ value, unless the comparator is set/not-set).</summary>
public sealed record TriggerConditionDto(string WhenFieldKey, string Comparator, string? CompareValue);

/// <summary>A trigger as returned to the admin UI.</summary>
public sealed record TriggerDto(
    Guid TriggerId,
    string ObjectType,
    string Kind,
    string Name,
    bool IsEnabled,
    string Cadence,
    int? RepeatIntervalDays,
    int? WindowDays,
    string NotificationCategory,
    IReadOnlyList<string> Recipients,
    string NotificationTitle,
    string NotificationBody,
    IReadOnlyList<TriggerConditionDto> Conditions);

/// <summary>Create/update payload for an Authored Request trigger. ObjectType and Kind are fixed
/// (Request / Authored) for this slice; the built-in kinds are configured elsewhere (Slices 4–5).</summary>
public sealed record TriggerUpsertRequest(
    string Name,
    bool IsEnabled,
    string Cadence,
    int? RepeatIntervalDays,
    string NotificationCategory,
    IReadOnlyList<string> Recipients,
    string NotificationTitle,
    string NotificationBody,
    IReadOnlyList<TriggerConditionDto> Conditions);

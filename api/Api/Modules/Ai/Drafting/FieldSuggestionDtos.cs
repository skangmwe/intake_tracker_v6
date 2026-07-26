namespace McDermott.AiTracker.Api.Modules.Ai.Drafting;

/// <summary>
/// Request body for the field-suggestion endpoint. <see cref="Fields"/> carries the record's current sibling
/// values keyed by their allowlist names; the controller projects them to the workspace allowlist before anything
/// reaches a provider (the client is never trusted to pre-filter). <see cref="SelectOptions"/> is set for a
/// single-select target so the suggestion can be validated against the option set.
/// </summary>
public sealed record FieldSuggestionRequest(
    string ObjectType,
    string? RecordId,
    string TargetFieldKey,
    IReadOnlyDictionary<string, string>? Fields,
    IReadOnlyList<string>? SelectOptions,
    string? Provider);

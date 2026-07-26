namespace McDermott.AiTracker.Api.Modules.Ai.Drafting;

/// <summary>
/// Proposes a value for one field from the record's own allowlisted context (Phase 4, §14 drafting).
/// The caller (controller) enforces the off-switch and projects the context to the workspace allowlist before
/// calling — this service only ever receives content already permitted to reach a provider, and never logs it
/// (api-pii-handling.md, api-logging.md).
/// </summary>
public interface IFieldSuggestionService
{
    /// <summary>
    /// Suggests a value for <paramref name="targetFieldKey"/>. <paramref name="allowlistedContext"/> is the record's
    /// sibling field values, already projected to the workspace content-field allowlist by the caller — empty context
    /// short-circuits to a null value with no provider call. <paramref name="selectOptions"/> (non-null for a
    /// single-select target) constrains the result to one of the options verbatim; any other value is dropped to null.
    /// </summary>
    Task<FieldSuggestion> SuggestAsync(
        Guid workspaceId,
        Guid userId,
        string objectType,
        string targetFieldKey,
        IReadOnlyDictionary<string, string> allowlistedContext,
        IReadOnlyList<string>? selectOptions,
        string? provider,
        CancellationToken ct);
}

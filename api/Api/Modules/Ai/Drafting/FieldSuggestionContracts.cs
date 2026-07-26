namespace McDermott.AiTracker.Api.Modules.Ai.Drafting;

/// <summary>
/// A proposed value for one field, produced from the record's own allowlisted context.
/// <paramref name="Value"/> is null when the model has no confident suggestion (empty output, or — for a
/// single-select — a value outside the option set). <paramref name="Rationale"/> is a one-line explanation
/// shown alongside the AI-labelled suggestion so the user can judge whether to accept it.
/// </summary>
public sealed record FieldSuggestion(string? Value, string Rationale);

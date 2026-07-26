using System.Text.Json;

namespace McDermott.AiTracker.Api.Modules.Ai.Config;

/// <summary>The workspace AI-assist configuration: the off-switch and the content-field allowlist.</summary>
public sealed record AiConfigDto(bool Enabled, IReadOnlyList<string> ContentFieldAllowlist);

/// <summary>Request body for PUT ai/config.</summary>
public sealed class AiConfigUpdateRequest
{
    public bool Enabled { get; set; }

    public List<string> ContentFieldAllowlist { get; set; } = new();
}

/// <summary>
/// The content-field allowlist policy — the data-sensitivity floor made concrete. Only non-PII intake
/// text is ever eligible; client/matter numbers and user identities are absent by construction, so an
/// admin cannot configure them into what the AI layer sends to a provider.
/// </summary>
public static class AiContentAllowlist
{
    /// <summary>The only content fields the AI layer may read/send. Deliberately excludes every PII and
    /// client-matter field.</summary>
    public static readonly IReadOnlyList<string> Allowed = new[] { "Name", "Description", "WorkflowDetails" };

    public static string Serialize(IReadOnlyList<string> fields) => JsonSerializer.Serialize(fields);

    public static IReadOnlyList<string> Deserialize(string? json) =>
        string.IsNullOrWhiteSpace(json)
            ? Array.Empty<string>()
            : JsonSerializer.Deserialize<List<string>>(json) ?? new List<string>();

    /// <summary>Valid iff non-empty and a subset of <see cref="Allowed"/> (exact, case-sensitive match).</summary>
    public static bool IsValid(IReadOnlyList<string> fields) =>
        fields.Count > 0 && fields.All(field => Allowed.Contains(field, StringComparer.Ordinal));
}

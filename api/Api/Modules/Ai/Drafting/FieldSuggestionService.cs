using System.Diagnostics;
using System.Text;
using System.Text.Json;
using McDermott.AiTracker.Api.Modules.Ai.Providers;

namespace McDermott.AiTracker.Api.Modules.Ai.Drafting;

/// <summary>
/// Builds a grounded, non-streaming prompt from a record's allowlisted context and asks the configured provider
/// for a single field value. Enforces the §14 guardrails that live at this layer: only the allowlisted context the
/// caller passes ever reaches the provider (data floor), the suggestion is a proposal the user must accept
/// (human-in-loop — the service never applies it), and nothing invents facts beyond the given fields. Prompts and
/// responses are never logged; only the target field key and duration are (api-pii-handling.md, api-logging.md).
/// </summary>
public sealed class FieldSuggestionService : IFieldSuggestionService
{
    // A single field value is short — a small cap keeps latency and cost low. Not a routing threshold.
    private const int MaxSuggestionTokens = 512;

    private const string SystemPrompt =
        "You help fill in one field of an intake record. Propose a value for the target field using ONLY the other " +
        "field values provided. Never invent facts that are not supported by those fields. Do not produce legal " +
        "conclusions or recommendations. If the provided fields do not support a confident value, return an empty " +
        "value. Respond with a single JSON object and nothing else: {\"value\": <string, or empty string>, " +
        "\"rationale\": <one short sentence>}.";

    private static readonly JsonSerializerOptions JsonWeb = new(JsonSerializerDefaults.Web);

    private readonly ILlmProviderFactory _providers;
    private readonly ILogger<FieldSuggestionService> _logger;

    public FieldSuggestionService(ILlmProviderFactory providers, ILogger<FieldSuggestionService> logger)
    {
        _providers = providers;
        _logger = logger;
    }

    public async Task<FieldSuggestion> SuggestAsync(
        Guid workspaceId,
        Guid userId,
        string objectType,
        string targetFieldKey,
        IReadOnlyDictionary<string, string> allowlistedContext,
        IReadOnlyList<string>? selectOptions,
        string? provider,
        CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();

        // Empty context can only produce invention — short-circuit without a provider call.
        if (allowlistedContext.All(entry => string.IsNullOrWhiteSpace(entry.Value)))
        {
            return new FieldSuggestion(null, "There isn't enough information in the other fields to suggest a value.");
        }

        var request = BuildRequest(objectType, targetFieldKey, allowlistedContext, selectOptions);

        var stopwatch = Stopwatch.StartNew();
        var completion = await _providers.Get(provider).CompleteAsync(request, MaxSuggestionTokens, ct).ConfigureAwait(false);

        var parsed = Parse(completion.Text);
        var value = string.IsNullOrWhiteSpace(parsed.Value) ? null : parsed.Value.Trim();

        // A single-select value must be one of the offered options verbatim — else drop it (never invent an option).
        if (value is not null && selectOptions is not null && !selectOptions.Contains(value, StringComparer.Ordinal))
        {
            value = null;
        }

        var rationale = string.IsNullOrWhiteSpace(parsed.Rationale)
            ? (value is null ? "No confident suggestion." : "Suggested from the other field values.")
            : parsed.Rationale!.Trim();

        _logger.LogInformation(
            "Field suggestion for {FieldKey} in workspace {WorkspaceId}: {Outcome} in {DurationMs}ms.",
            targetFieldKey, workspaceId, value is null ? "no-value" : "value", stopwatch.ElapsedMilliseconds);

        return new FieldSuggestion(value, rationale);
    }

    private static LlmRequest BuildRequest(
        string objectType,
        string targetFieldKey,
        IReadOnlyDictionary<string, string> allowlistedContext,
        IReadOnlyList<string>? selectOptions)
    {
        var content = new StringBuilder();
        content.Append("Record type: ").Append(objectType).Append('\n');
        content.Append("Target field: ").Append(targetFieldKey).Append('\n');

        if (selectOptions is { Count: > 0 })
        {
            content.Append("The target field accepts only these options; return exactly one of them verbatim, ")
                .Append("or an empty value if none fits — never invent an option: ")
                .Append(string.Join(" | ", selectOptions)).Append('\n');
        }

        content.Append("Other fields:\n");
        foreach (var entry in allowlistedContext)
        {
            if (string.IsNullOrWhiteSpace(entry.Value))
            {
                continue;
            }

            content.Append(entry.Key).Append(": ").Append(entry.Value).Append('\n');
        }

        return new LlmRequest(SystemPrompt, new[] { new LlmMessage("user", content.ToString().TrimEnd()) });
    }

    private static SuggestionPayload Parse(string text)
    {
        // The model is instructed to return a bare JSON object; tolerate leading/trailing prose defensively.
        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end <= start)
        {
            return new SuggestionPayload(null, null);
        }

        try
        {
            return JsonSerializer.Deserialize<SuggestionPayload>(text[start..(end + 1)], JsonWeb)
                ?? new SuggestionPayload(null, null);
        }
        catch (JsonException)
        {
            return new SuggestionPayload(null, null);
        }
    }

    private sealed record SuggestionPayload(string? Value, string? Rationale);
}

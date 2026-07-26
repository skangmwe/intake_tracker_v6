// Shared projection for dynamic-FieldValues objects (field-surfacing sweep). Request and Feature both
// store every content value in a single FieldValues JSON map keyed by field key; their CSV export
// projects that map into a value dict keyed by field key, with the record's id as the identity column.
// This is the one place that parses the map and formats each value for a CSV cell, so the two objects
// (and any future FieldValues object) format identically. Row values are Confidential — the caller
// writes them to the response, never to a log (api-pii-handling.md).

using System.Text.Json;

namespace McDermott.AiTracker.Api.Modules.ImportExport;

internal static class FieldValuesProjector
{
    /// <summary>Multi-value fields (tags, compliance flags, tech stack) join with this separator.</summary>
    private const string MultiValueSeparator = "; ";

    /// <summary>Project a record's FieldValues JSON map into a value dict keyed by field key. Values are
    /// materialised (string / number / joined multi-value / Yes-No) before the parsed document is
    /// disposed. The identity "id" (the record id) always wins over any "id" key in the map.</summary>
    public static IReadOnlyDictionary<string, object?> Project(string recordId, string? fieldValuesJson)
    {
        var cells = new Dictionary<string, object?>(StringComparer.Ordinal);

        var json = string.IsNullOrWhiteSpace(fieldValuesJson) ? "{}" : fieldValuesJson;
        using (var document = JsonDocument.Parse(json))
        {
            if (document.RootElement.ValueKind == JsonValueKind.Object)
            {
                foreach (var property in document.RootElement.EnumerateObject())
                {
                    cells[property.Name] = FormatValue(property.Value);
                }
            }
        }

        cells["id"] = recordId;
        return cells;
    }

    /// <summary>Project an already-parsed FieldValues map into a mutable cell dict keyed by field key,
    /// formatting each value for a CSV cell. Unlike the JSON-string overload it does NOT set an identity
    /// column — the caller injects "id"/"name" (custom records carry a first-class Name column). Used by
    /// CustomObjectIoObject, whose records service returns Fields already parsed to JsonElements.</summary>
    public static Dictionary<string, object?> Project(IReadOnlyDictionary<string, JsonElement> fields)
    {
        var cells = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var (key, value) in fields)
        {
            cells[key] = FormatValue(value);
        }

        return cells;
    }

    /// <summary>Materialise a JSON value into a CSV cell value: strings as-is, numbers as their numeric
    /// value (invariant-formatted downstream), booleans as Yes/No, arrays joined, objects as raw JSON,
    /// null/absent as null (an empty cell).</summary>
    private static object? FormatValue(JsonElement element) => element.ValueKind switch
    {
        JsonValueKind.String => element.GetString(),
        // Cast the integer branch to object so the ternary does not widen both branches to double —
        // that would box every integer as a double (losing int64 precision for large values).
        JsonValueKind.Number => element.TryGetInt64(out var number) ? (object)number : element.GetDouble(),
        JsonValueKind.True => "Yes",
        JsonValueKind.False => "No",
        JsonValueKind.Array => string.Join(MultiValueSeparator, element.EnumerateArray().Select(FormatScalar)),
        JsonValueKind.Object => element.GetRawText(),
        _ => null,
    };

    private static string FormatScalar(JsonElement element) => element.ValueKind switch
    {
        JsonValueKind.String => element.GetString() ?? string.Empty,
        JsonValueKind.Number => element.GetRawText(),
        JsonValueKind.True => "Yes",
        JsonValueKind.False => "No",
        _ => element.GetRawText(),
    };
}

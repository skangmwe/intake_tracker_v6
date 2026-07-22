// Pure CSV-row → RequestCreateRequest mapping (Slice 16). Header names are normalised (lower-cased,
// non-alphanumerics stripped) and matched against a fixed alias table for the create-only Request
// import (BS §13, §17). Name/Description populate the DTO's own fields; the rest ride the open Fields
// map as JSON string values (RequestsService.ValidateCreate already reads scores tolerantly from
// strings). The Requestor value is extracted separately — the runner resolves it against the user
// directory (SSO) before creating. Unknown columns are ignored; a fuller schema-driven mapping is an
// S30 Fields-admin concern. No IO here — fully unit-tested. CSV values are Confidential — never logged.

using System.Text.Json;
using McDermott.AiTracker.Api.Modules.Requests;

namespace McDermott.AiTracker.Api.Modules.ImportExport;

/// <summary>The create request built from one CSV row plus the raw Requestor value (resolved later).</summary>
public sealed record MappedRow(RequestCreateRequest Create, string? RequestorValue);

public static class CsvRowMapper
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    /// <summary>Field key for the caller-supplied Requestor column — resolved to a user by the runner.</summary>
    public const string RequestorFieldKey = "requestor";

    // Normalised header alias -> content field key. Name / Description are handled out-of-band.
    private static readonly IReadOnlyDictionary<string, string> FieldAliases = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["deptpgclient"] = "deptPgClient",
        ["deptorpgorclient"] = "deptPgClient",
        ["dept"] = "deptPgClient",
        ["clientnumber"] = "clientNumber",
        ["clientno"] = "clientNumber",
        ["clientnum"] = "clientNumber",
        ["businessvalue"] = "businessValue",
        ["efficiencygain"] = "efficiencyGain",
        ["levelofeffort"] = "levelOfEffort",
        ["requesttype"] = "requestType",
        ["businessowner"] = "businessOwner",
    };

    private static readonly IReadOnlyDictionary<string, string> NameAliases = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["name"] = "name",
        ["requestname"] = "name",
        ["title"] = "name",
        ["description"] = "description",
        ["desc"] = "description",
        ["summary"] = "description",
    };

    private static readonly HashSet<string> RequestorAliases = new(StringComparer.Ordinal)
    {
        "requestor", "requester", "requestoremail", "requesteremail", "requestedby",
    };

    /// <summary>Field key the wizard maps a column to for the request name.</summary>
    public const string NameFieldKey = "name";

    /// <summary>Field key the wizard maps a column to for the request description.</summary>
    public const string DescriptionFieldKey = "description";

    /// <summary>Map one row (header + value arrays, positionally aligned) to a create request via the
    /// header-alias auto-match (the backward-compat no-mapping path).</summary>
    public static MappedRow Map(IReadOnlyList<string> headers, IReadOnlyList<string?> values) =>
        BuildRequestCreate(AutoMatchValues(headers, values));

    /// <summary>
    /// Map one row from an explicit column→field mapping (the import wizard's Map-columns step) instead
    /// of the header-alias auto-match. <c>name</c>/<c>description</c> populate the DTO's own fields;
    /// <c>requestor</c> is extracted for SSO resolution; every other key rides the open Fields map.
    /// </summary>
    public static MappedRow MapFromMapping(
        IReadOnlyList<ImportColumnMapping> mapping, IReadOnlyList<string?> values) =>
        BuildRequestCreate(MapValues(mapping, values));

    /// <summary>
    /// Reduce an explicit column→field mapping to a field-key → value map (the object-agnostic step the
    /// import runner runs before handing rows to a descriptor). Blank cells and out-of-range indices are
    /// skipped; the first mapping to a given field wins. No IO — pure.
    /// </summary>
    public static IReadOnlyDictionary<string, string?> MapValues(
        IReadOnlyList<ImportColumnMapping> mapping, IReadOnlyList<string?> values)
    {
        var fieldValues = new Dictionary<string, string?>(StringComparer.Ordinal);
        foreach (var entry in mapping)
        {
            if (entry.ColumnIndex < 0 || entry.ColumnIndex >= values.Count || string.IsNullOrWhiteSpace(entry.FieldKey))
            {
                continue;
            }

            var value = values[entry.ColumnIndex]?.Trim();
            if (string.IsNullOrEmpty(value) || fieldValues.ContainsKey(entry.FieldKey))
            {
                continue;
            }

            fieldValues[entry.FieldKey] = value;
        }

        return fieldValues;
    }

    /// <summary>
    /// Reduce a header row to a field-key → value map using the Request header-alias table (the
    /// no-mapping backward-compat path). Requestor / Name / Description headers resolve to their field
    /// keys; every other known header resolves to its content field key. No IO — pure.
    /// </summary>
    public static IReadOnlyDictionary<string, string?> AutoMatchValues(
        IReadOnlyList<string> headers, IReadOnlyList<string?> values)
    {
        var fieldValues = new Dictionary<string, string?>(StringComparer.Ordinal);
        var count = Math.Min(headers.Count, values.Count);
        for (var index = 0; index < count; index++)
        {
            var key = Normalise(headers[index]);
            if (key.Length == 0)
            {
                continue;
            }

            var value = values[index]?.Trim();
            if (string.IsNullOrEmpty(value))
            {
                continue;
            }

            if (RequestorAliases.Contains(key))
            {
                // Requestor resolves last-wins, preserving the original auto-match behaviour.
                fieldValues[RequestorFieldKey] = value;
            }
            else if (NameAliases.TryGetValue(key, out var nameKey) && !fieldValues.ContainsKey(nameKey))
            {
                fieldValues[nameKey] = value;
            }
            else if (FieldAliases.TryGetValue(key, out var fieldKey) && !fieldValues.ContainsKey(fieldKey))
            {
                fieldValues[fieldKey] = value;
            }
        }

        return fieldValues;
    }

    /// <summary>
    /// Build a Request create request from a field-key → value map: <c>name</c>/<c>description</c>
    /// populate the DTO's own fields; <c>requestor</c> is extracted for later SSO resolution; every
    /// other key rides the open Fields map as a JSON string. No IO — pure.
    /// </summary>
    public static MappedRow BuildRequestCreate(IReadOnlyDictionary<string, string?> fieldValues)
    {
        string? name = null;
        string? description = null;
        string? requestor = null;
        var fields = new Dictionary<string, JsonElement>(StringComparer.Ordinal);

        foreach (var (key, rawValue) in fieldValues)
        {
            var value = rawValue?.Trim();
            if (string.IsNullOrEmpty(value))
            {
                continue;
            }

            switch (key)
            {
                case NameFieldKey:
                    name = value;
                    break;
                case DescriptionFieldKey:
                    description = value;
                    break;
                case RequestorFieldKey:
                    requestor = value;
                    break;
                default:
                    fields[key] = JsonSerializer.SerializeToElement(value, JsonOptions);
                    break;
            }
        }

        var create = new RequestCreateRequest
        {
            Name = name,
            Description = description,
            Fields = fields,
        };
        return new MappedRow(create, requestor);
    }

    /// <summary>Lower-case + strip every non-alphanumeric so header spelling/spacing doesn't matter.</summary>
    public static string Normalise(string? header)
    {
        if (string.IsNullOrEmpty(header))
        {
            return string.Empty;
        }

        Span<char> buffer = stackalloc char[header.Length];
        var length = 0;
        foreach (var character in header)
        {
            if (char.IsLetterOrDigit(character))
            {
                buffer[length++] = char.ToLowerInvariant(character);
            }
        }

        return new string(buffer[..length]);
    }
}

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

    /// <summary>Map one row (header + value arrays, positionally aligned) to a create request.</summary>
    public static MappedRow Map(IReadOnlyList<string> headers, IReadOnlyList<string?> values)
    {
        string? name = null;
        string? description = null;
        string? requestor = null;
        var fields = new Dictionary<string, JsonElement>(StringComparer.Ordinal);

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
                requestor = value;
            }
            else if (NameAliases.TryGetValue(key, out var nameKey))
            {
                if (nameKey == "name")
                {
                    name ??= value;
                }
                else
                {
                    description ??= value;
                }
            }
            else if (FieldAliases.TryGetValue(key, out var fieldKey) && !fields.ContainsKey(fieldKey))
            {
                fields[fieldKey] = JsonSerializer.SerializeToElement(value, JsonOptions);
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

    /// <summary>Field key the wizard maps a column to for the request name.</summary>
    public const string NameFieldKey = "name";

    /// <summary>Field key the wizard maps a column to for the request description.</summary>
    public const string DescriptionFieldKey = "description";

    /// <summary>
    /// Map one row from an explicit column→field mapping (the import wizard's Map-columns step) instead
    /// of the header-alias auto-match. Each mapping entry names a source column index and the target
    /// field key. <c>name</c>/<c>description</c> populate the DTO's own fields; <c>requestor</c> is
    /// extracted for SSO resolution; every other key rides the open Fields map. Blank cells and
    /// out-of-range indices are skipped; the first mapping to a given field wins. No IO — pure.
    /// </summary>
    public static MappedRow MapFromMapping(
        IReadOnlyList<ImportColumnMapping> mapping, IReadOnlyList<string?> values)
    {
        string? name = null;
        string? description = null;
        string? requestor = null;
        var fields = new Dictionary<string, JsonElement>(StringComparer.Ordinal);

        foreach (var entry in mapping)
        {
            if (entry.ColumnIndex < 0 || entry.ColumnIndex >= values.Count || string.IsNullOrWhiteSpace(entry.FieldKey))
            {
                continue;
            }

            var value = values[entry.ColumnIndex]?.Trim();
            if (string.IsNullOrEmpty(value))
            {
                continue;
            }

            switch (entry.FieldKey)
            {
                case NameFieldKey:
                    name ??= value;
                    break;
                case DescriptionFieldKey:
                    description ??= value;
                    break;
                case RequestorFieldKey:
                    requestor ??= value;
                    break;
                default:
                    if (!fields.ContainsKey(entry.FieldKey))
                    {
                        fields[entry.FieldKey] = JsonSerializer.SerializeToElement(value, JsonOptions);
                    }

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

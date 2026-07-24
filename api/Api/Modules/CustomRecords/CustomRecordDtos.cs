// Custom-object records module DTOs (Slice 1b). A custom record is one row of a CUSTOM object
// (dbo.ObjectDefinition), stored in the generic dbo.CustomRecords table with content in a FieldValues
// JSON map — the same model Requests/Features use. All CRUD runs through stored procedures
// (api-data-access.md), so the DB rows are keyless FromSqlRaw projections (like RequestRow /
// ObjectDefinitionRow), not tracked entities. Field values are Confidential — never logged
// (api-pii-handling.md). ETag is the base64 of the row's RowVer, consistent with Request/Task records.

using System.Text.Json;

namespace McDermott.AiTracker.Api.Modules.CustomRecords;

// ---------- API DTOs ----------

/// <summary>Outcome of a create / patch / delete write. Access (403) is enforced at the controller
/// on the route workspace (mirroring RequestsController's workspace-scoped gating), so the service
/// distinguishes only Success, NotFound (object/record out of scope → 404), and ValidationFailed.</summary>
public enum CustomRecordWriteOutcome
{
    Success,
    NotFound,
    ValidationFailed,
}

/// <summary>Result of a create / patch write — the mapped record on success, per-field errors on
/// validation failure.</summary>
public sealed record CustomRecordWriteResult(
    CustomRecordWriteOutcome Outcome,
    CustomRecordDto? Record = null,
    IReadOnlyDictionary<string, string[]>? Errors = null);

/// <summary>POST / PATCH body — the record's display Name and the full field-value map (a patch
/// replaces the whole map).</summary>
public sealed record CustomRecordWriteRequest(
    string? Name,
    IReadOnlyDictionary<string, JsonElement>? Fields);

/// <summary>The full record returned by create / get / patch.</summary>
public sealed record CustomRecordDto(
    Guid Id,
    Guid ObjectDefinitionId,
    string Name,
    IReadOnlyDictionary<string, JsonElement> Fields,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    string CreatedBy,
    string ETag);

/// <summary>One row of a custom-object record list page.</summary>
public sealed record CustomRecordListRow(
    Guid Id,
    string Name,
    IReadOnlyDictionary<string, JsonElement> Fields,
    string ETag);

// ---------- Row projections (EF Core keyless entities for FromSqlRaw) ----------

/// <summary>usp_GetCustomRecordById — one record row (or none when soft-deleted / out of scope).</summary>
public sealed class CustomRecordReadRow
{
    public Guid RecordId { get; set; }
    public Guid ObjectDefinitionId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string FieldValues { get; set; } = "{}";
    public byte[] RowVer { get; set; } = Array.Empty<byte>();
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Bound by column name from usp_GetCustomRecordById (last projected column). The Entra oid GUID of
    // the record's creator — an opaque identifier, not PII (api-logging.md), surfaced on the DTO for
    // the "Created by" meta strip. Stored as NVARCHAR(256) (dbo.CustomRecords.CreatedBy audit column).
    public string CreatedBy { get; set; } = string.Empty;
}

/// <summary>usp_QueryCustomRecords — one page row plus the window total (COUNT(*) OVER()).</summary>
public sealed class CustomRecordQueryRow
{
    public Guid RecordId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string FieldValues { get; set; } = "{}";
    public byte[] RowVer { get; set; } = Array.Empty<byte>();
    public int TotalCount { get; set; }
}

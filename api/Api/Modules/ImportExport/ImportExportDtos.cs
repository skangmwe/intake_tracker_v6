// Wire contracts for the Import/Export module (Slice 16 — api-contracts.md §17). Property names
// serialize to camelCase (ASP.NET Core web defaults) so they mirror /shared/types/imports.ts exactly.
// Status travels as a string matching the ImportStatus union. Requestor emails and CSV field values
// are Confidential/PII — they live only in the DB and the response report, never in a log
// (api-pii-handling.md).

using System.Text.Json.Serialization;

namespace McDermott.AiTracker.Api.Modules.ImportExport;

/// <summary>202 body from POST /workspaces/{id}/imports/csv — mirrors ImportStartResponse.</summary>
public sealed record ImportStartResponseDto(Guid ImportId, string Status);

/// <summary>One reason a row was flagged (hard failure) or warned (soft fallback). Mirrors the TS shape.</summary>
public sealed record ImportReasonDto(
    string Code,
    string Message,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Field = null);

/// <summary>A flagged/warned row in the per-row report. Mirrors ImportFlaggedRow in imports.ts.</summary>
public sealed record ImportFlaggedRowDto(int RowIndex, IReadOnlyList<ImportReasonDto> Reasons);

/// <summary>GET /imports/{id} — job status + the per-row report. Mirrors ImportStatusDto.</summary>
public sealed record ImportStatusResponse(
    Guid Id,
    Guid WorkspaceId,
    Guid StartedBy,
    DateTime StartedAt,
    string Status,
    int TotalRows,
    int LandedRows,
    IReadOnlyList<ImportFlaggedRowDto> FlaggedRows);

/// <summary>POST /exports body — mirrors ExportRequest in imports.ts.</summary>
public sealed class ExportRequestBody
{
    public Guid SavedViewId { get; set; }
}

// ─── Object-aware import/export (S28 tabs + wizards) ───────────────────────────

/// <summary>One import/export field spec for the wizard. Mirrors IoFieldSpec in imports.ts. Nulls for
/// the two flags are omitted so the wire shape stays minimal.</summary>
public sealed record IoFieldSpecDto(
    string Key,
    string Label,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? Required = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? AlwaysIncluded = null);

/// <summary>GET /workspaces/{id}/io/objects row — an importable/exportable object and its fields.
/// Mirrors IoObjectDto in imports.ts.</summary>
public sealed record IoObjectDto(
    string ObjectType,
    string Label,
    bool CanImport,
    bool CanExport,
    IReadOnlyList<IoFieldSpecDto> ImportFields,
    IReadOnlyList<IoFieldSpecDto> ExportFields);

/// <summary>One CSV-column → object-field mapping from the import wizard. Mirrors ImportColumnMapping.</summary>
public sealed record ImportColumnMapping(int ColumnIndex, string FieldKey);

/// <summary>POST /workspaces/{id}/exports/object body — object + chosen field columns. Mirrors
/// ObjectExportRequest in imports.ts.</summary>
public sealed class ObjectExportRequestBody
{
    public string? ObjectType { get; set; }

    public IReadOnlyList<string>? FieldKeys { get; set; }
}

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

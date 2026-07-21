// Objects module DTOs (Slice — Objects tab, S30 Fields & objects → Objects). Shapes align with
// shared/types/objects.ts. Row entities are HasNoKey / ToView projections read via FromSqlRaw
// against usp_ListObjectDefinitions / usp_GetObjectDefinitionById / usp_GetObjectRecordCounts.

namespace McDermott.AiTracker.Api.Modules.Objects;

/// <summary>DTO returned by GET /workspaces/{id}/objects and item reads. Location serializes as the
/// string 'Global' | 'LocalWorkspace'. RecordsCount/FieldsCount are derived (read-only).</summary>
public sealed record ObjectDefinitionDto(
    Guid Id,
    Guid WorkspaceId,
    string Name,
    string? PluralLabel,
    string Location,
    string? Description,
    bool ShowInSidebar,
    string? SidebarCategory,
    int RecordsCount,
    int FieldsCount,
    bool IsSystem);

public sealed record ObjectDefinitionCreateRequest(
    string Name,
    string? PluralLabel,
    string Location,
    string? Description,
    bool ShowInSidebar,
    string? SidebarCategory);

public sealed record ObjectDefinitionPatchRequest(
    string? Name,
    string? PluralLabel,
    string? Location,
    string? Description,
    bool? ShowInSidebar,
    string? SidebarCategory);

// ---------- Row projections (EF Core keyless entities for FromSqlRaw) ----------

/// <summary>Row instance of one custom object definition (usp_ListObjectDefinitions / …ById).</summary>
public sealed class ObjectDefinitionRow
{
    public Guid ObjectDefinitionId { get; set; }
    public Guid WorkspaceId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? PluralLabel { get; set; }
    public string Location { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool ShowInSidebar { get; set; }
    public string? SidebarCategory { get; set; }
}

/// <summary>Single-row live counts for the five built-in objects (usp_GetObjectRecordCounts).</summary>
public sealed class ObjectRecordCountsRow
{
    public int RequestRecords { get; set; }
    public int TaskRecords { get; set; }
    public int AttachmentRecords { get; set; }
    public int FeatureRecords { get; set; }
    public int ToolkitRecords { get; set; }
    public int RequestFields { get; set; }
    public int TaskFields { get; set; }
    public int FeatureFields { get; set; }
}

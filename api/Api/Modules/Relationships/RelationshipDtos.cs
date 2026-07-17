// Relationships module DTOs (Slice 25 — v2-reconciliation.md §API deltas Relationships).
// Shapes align with shared/types/relationships.ts. Row entities are HasNoKey / ToView
// projections read via FromSqlRaw against usp_ListRelationships / usp_ListRecordLinks.

namespace McDermott.AiTracker.Api.Modules.Relationships;

/// <summary>DTO returned by GET /workspaces/{id}/relationships and item reads.</summary>
public sealed record RelationshipDto(
    Guid Id,
    Guid WorkspaceId,
    string Name,
    string FromObjectType,
    string ToObjectType,
    string Cardinality,
    string FromSideLabel,
    string ToSideLabel,
    bool ShowOnFromAsTab,
    string? TabLabel,
    int SortOrder,
    bool IsRetired,
    bool IsSystem,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    string CreatedBy,
    string UpdatedBy);

public sealed record RelationshipCreateRequest(
    string Name,
    string FromObjectType,
    string ToObjectType,
    string Cardinality,
    string FromSideLabel,
    string ToSideLabel,
    bool? ShowOnFromAsTab,
    string? TabLabel,
    int? SortOrder);

public sealed record RelationshipPatchRequest(
    string? Name,
    string? FromSideLabel,
    string? ToSideLabel,
    bool? ShowOnFromAsTab,
    string? TabLabel,
    int? SortOrder);

/// <summary>Response from POST /relationships/{id}/retire. LinkCount > 0 with Retired=false means 409.</summary>
public sealed record RelationshipRetireResponse(Guid RelationshipId, int LinkCount, bool Retired);

/// <summary>Row instance of a relationship (from a RecordLink).</summary>
public sealed record RelationshipLinkDto(
    Guid Id,
    Guid RelationshipId,
    string FromRecordId,
    string ToRecordId,
    string ToRecordDisplayName,
    string? ToRecordStage,
    string Direction,
    DateTime CreatedAt,
    string CreatedBy);

public sealed record RelationshipLinkCreateRequest(Guid RelationshipId, string ToRecordId);

// ---------- Row projections (EF Core keyless entities for FromSqlRaw) ----------

public sealed class RelationshipRow
{
    public Guid RelationshipId { get; set; }
    public Guid WorkspaceId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string FromObjectType { get; set; } = string.Empty;
    public string ToObjectType { get; set; } = string.Empty;
    public string Cardinality { get; set; } = string.Empty;
    public string FromSideLabel { get; set; } = string.Empty;
    public string ToSideLabel { get; set; } = string.Empty;
    public bool ShowOnFromAsTab { get; set; }
    public string? TabLabel { get; set; }
    public int SortOrder { get; set; }
    public bool IsRetired { get; set; }
    public bool IsSystem { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;
}

public sealed class RecordLinkRow
{
    public Guid Id { get; set; }
    public Guid RelationshipId { get; set; }
    public string FromRecordId { get; set; } = string.Empty;
    public string ToRecordId { get; set; } = string.Empty;
    public string ToRecordDisplayName { get; set; } = string.Empty;
    public string? ToRecordStage { get; set; }
    public string Direction { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public string CreatedBy { get; set; } = string.Empty;
}

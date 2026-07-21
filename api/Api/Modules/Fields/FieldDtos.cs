// Wire contracts for the Fields module (S30 / S34). Property names serialize to camelCase
// (ASP.NET Core web defaults) so they match /shared/types/fields.ts exactly. No PII here —
// field schema is configuration, not user data.

using System.ComponentModel.DataAnnotations;

namespace McDermott.AiTracker.Api.Modules.Fields;

/// <summary>GET response for a workspace's field schema — the S30 admin surface.</summary>
public sealed record WorkspaceFieldSchemaDto(
    Guid WorkspaceId,
    string ObjectType,
    IReadOnlyList<FieldDefinitionDto> Fields,
    IReadOnlyList<PlatformFieldDto> PlatformFields);

public sealed record FieldDefinitionDto(
    Guid Id,
    Guid WorkspaceId,
    string ObjectType,
    string FieldKey,
    string DisplayName,
    string FieldType,
    string Category,
    string? Section,
    string? HelpText,
    bool IsRequired,
    bool IsReadOnly,
    bool IsPlatformDefined,
    bool IsSystemProvisioned,
    // 'Global' (available to every workspace) | 'LocalWorkspace' (this workspace only).
    string Location,
    // False for a foreign Global field surfaced here — read-only, editable only from its owner.
    bool IsLocal,
    string? PlatformFieldKey,
    IReadOnlyList<string>? VisibleStages,
    string? CrossingToFieldKey,
    decimal? MinValue,
    decimal? MaxValue,
    bool AllowNewValues,
    int SortOrder,
    bool IsRetired,
    IReadOnlyList<SelectOptionDto> Options,
    IReadOnlyList<FieldRuleDto> Rules,
    DerivedFieldDto? Derived,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>The flat, all-object-types field catalog behind the reconciled S30 Fields tab.</summary>
public sealed record WorkspaceFieldCatalogDto(
    Guid WorkspaceId,
    IReadOnlyList<FieldCatalogRowDto> Rows);

/// <summary>One row of the Fields tab table (FIELD · KEY · TYPE · OBJECT · LOCATION · REQUIRED ·
/// SOURCE · STATUS). <c>Source</c> is "System" or "User"; <c>Status</c> is "Active" or "Archived".
/// <c>ObjectLabel</c> is the display name ("Toolkit item"); <c>ObjectType</c> is the machine key.</summary>
public sealed record FieldCatalogRowDto(
    string Id,
    string ObjectType,
    string ObjectLabel,
    string FieldKey,
    string DisplayName,
    string FieldType,
    string Location,
    bool IsRequired,
    string Source,
    string Status,
    bool IsReadOnly);

public sealed record SelectOptionDto(string Id, string Value, string Label, int SortOrder);

public sealed record FieldRuleDto(
    string Id,
    string Action,
    string WhenFieldKey,
    string Comparator,
    string? CompareValue,
    string? ProduceValue,
    int SortOrder);

public sealed record DerivedFieldDto(string Kind, string? Expression, string? DefaultValue);

/// <summary>Platform-defined field (S34 read-only band on S30; editable only in S34).</summary>
public sealed record PlatformFieldDto(
    Guid Id,
    string FieldKey,
    string DisplayName,
    string FieldType,
    string Category,
    bool IsSystemImmutable,
    bool HasManualWritePath,
    IReadOnlyList<string>? SelectOptions);

/// <summary>A task-library typed field (S30 field library, consumed by the Tasks composer).</summary>
public sealed record TaskLibraryFieldDto(
    Guid Id,
    string FieldKey,
    string DisplayName,
    string FieldType,
    IReadOnlyList<SelectOptionDto> Options,
    int SortOrder,
    bool IsRetired);

// ─── Request bodies ────────────────────────────────────────────────────────
public sealed class SelectOptionInput
{
    [Required]
    [MaxLength(200)]
    public string? Value { get; set; }

    [Required]
    [MaxLength(200)]
    public string? Label { get; set; }

    public int SortOrder { get; set; }
}

public sealed class FieldRuleInput
{
    [Required]
    [RegularExpression("^(Show|Hide|Require|ProduceValue)$")]
    public string? Action { get; set; }

    [Required]
    [MaxLength(64)]
    public string? WhenFieldKey { get; set; }

    [Required]
    [RegularExpression("^(eq|neq|gt|gte|lt|lte|isSet|isNotSet|contains)$")]
    public string? Comparator { get; set; }

    [MaxLength(400)]
    public string? CompareValue { get; set; }

    [MaxLength(400)]
    public string? ProduceValue { get; set; }

    public int SortOrder { get; set; }
}

public sealed class DerivedFieldInput
{
    [Required]
    [RegularExpression("^(Calculation|DerivedCategory)$")]
    public string? Kind { get; set; }

    [MaxLength(1000)]
    public string? Expression { get; set; }

    [MaxLength(400)]
    public string? DefaultValue { get; set; }
}

/// <summary>Body for POST/PATCH of a workspace field. Options + rules replace wholesale on save.</summary>
public sealed class FieldDefinitionUpsertRequest
{
    [Required]
    [RegularExpression("^(Request|Task|Feature|ToolkitItem|Attachment)$")]
    public string? ObjectType { get; set; }

    // 'Global' (available to every workspace) | 'LocalWorkspace' (this workspace only).
    [RegularExpression("^(Global|LocalWorkspace)$")]
    public string Location { get; set; } = "LocalWorkspace";

    [Required]
    [MaxLength(64)]
    [RegularExpression("^[A-Za-z][A-Za-z0-9]*$", ErrorMessage = "Field key must be a camelCase identifier.")]
    public string? FieldKey { get; set; }

    [Required]
    [MaxLength(200)]
    public string? DisplayName { get; set; }

    [Required]
    public string? FieldType { get; set; }

    [Required]
    [RegularExpression("^(Crossing|AiSide|Platform|WorkspaceLocal)$")]
    public string? Category { get; set; }

    [MaxLength(64)]
    public string? Section { get; set; }

    [MaxLength(400)]
    public string? HelpText { get; set; }

    public bool IsRequired { get; set; }

    public IReadOnlyList<string>? VisibleStages { get; set; }

    [MaxLength(64)]
    public string? CrossingToFieldKey { get; set; }

    public decimal? MinValue { get; set; }

    public decimal? MaxValue { get; set; }

    public bool AllowNewValues { get; set; }

    public int SortOrder { get; set; }

    public IReadOnlyList<SelectOptionInput>? Options { get; set; }

    public IReadOnlyList<FieldRuleInput>? Rules { get; set; }

    public DerivedFieldInput? Derived { get; set; }
}

/// <summary>Body for adding a task-library field (S30). A narrower catalog than the full field set.</summary>
public sealed class TaskLibraryFieldUpsertRequest
{
    [Required]
    [MaxLength(64)]
    [RegularExpression("^[A-Za-z][A-Za-z0-9]*$", ErrorMessage = "Field key must be a camelCase identifier.")]
    public string? FieldKey { get; set; }

    [Required]
    [MaxLength(200)]
    public string? DisplayName { get; set; }

    [Required]
    [RegularExpression("^(Url|Text|Number|Date|Select|Checkbox)$")]
    public string? FieldType { get; set; }

    public IReadOnlyList<SelectOptionInput>? Options { get; set; }

    public int SortOrder { get; set; }
}

// Wire contracts for the Lifecycle & gates module (S31). Property names serialize to camelCase
// (ASP.NET Core web defaults) so they match /shared/types/gates.ts exactly. No PII except
// approver-team member display names (presentation only — never logged, per api-logging.md).

using System.ComponentModel.DataAnnotations;

namespace McDermott.AiTracker.Api.Modules.Lifecycle;

// ─── Responses ──────────────────────────────────────────────────────────────

/// <summary>GET /workspaces/{id}/lifecycle — the whole S31 surface.</summary>
public sealed record LifecycleConfigDto(
    Guid WorkspaceId,
    IReadOnlyList<LifecycleDto> Lifecycles,
    IReadOnlyList<string> RoleLabels,
    IReadOnlyList<ApproverTeamDto> ApproverTeams);

/// <summary>
/// GET /workspaces/{id}/lifecycles (v2, slice 27) — the lightweight list for the S3 intake
/// "Lifecycle" picker and the S31 dropdown. The <c>Name</c> is the single user-facing label
/// (the separate "Request type" was dropped in v2). Mirrors LifecycleSummaryDto in gates.ts.
/// </summary>
public sealed record LifecycleSummaryDto(Guid Id, string Name, bool IsDefault);

public sealed record LifecycleDto(
    Guid Id,
    string Name,
    string RequestType,
    bool IsDefault,
    int SortOrder,
    IReadOnlyList<StageDefinitionDto> Stages,
    IReadOnlyList<GateDefinitionDto> Gates);

public sealed record StageDefinitionDto(
    Guid Id,
    string Key,
    string Label,
    string StatusCategory,
    int SortOrder);

public sealed record GateDefinitionDto(
    Guid Id,
    Guid LifecycleId,
    string Name,
    Guid FromStageId,
    Guid ToStageId,
    string JoinKind,
    IReadOnlyList<GateSlotDto> Slots);

public sealed record GateSlotDto(string RoleLabel, int EligibleCount);

// RoleLabelId is the catalog id (null for a retired label that still has live members — such a
// team cannot be renamed or retired from the editor). Members carry Email for the S29 roster rows.
public sealed record ApproverTeamDto(
    string RoleLabel, IReadOnlyList<ApproverTeamMemberDto> Members, Guid? RoleLabelId = null);

public sealed record ApproverTeamMemberDto(Guid UserId, string DisplayName, string? Email = null);

// ─── Request bodies ───────────────────────────────────────────────────────────

/// <summary>PATCH body — the full lifecycle/stage/gate structure (reconciled wholesale).</summary>
public sealed class LifecycleConfigUpdateRequest
{
    [Required]
    public IReadOnlyList<LifecycleUpsertInput>? Lifecycles { get; set; }
}

public sealed class LifecycleUpsertInput
{
    /// <summary>Omit for a new lifecycle — the server mints the id.</summary>
    public Guid? Id { get; set; }

    [Required]
    [MaxLength(200)]
    public string? Name { get; set; }

    [Required]
    [MaxLength(120)]
    public string? RequestType { get; set; }

    public bool IsDefault { get; set; }

    public int SortOrder { get; set; }

    public IReadOnlyList<StageUpsertInput>? Stages { get; set; }

    public IReadOnlyList<GateUpsertInput>? Gates { get; set; }
}

public sealed class StageUpsertInput
{
    public Guid? Id { get; set; }

    [Required]
    [MaxLength(64)]
    public string? Key { get; set; }

    [Required]
    [MaxLength(120)]
    public string? Label { get; set; }

    [Required]
    [RegularExpression("^(Intake|Triage|Execution|Validation|Delivery|Stabilization|Closure)$")]
    public string? StatusCategory { get; set; }

    public int SortOrder { get; set; }
}

public sealed class GateUpsertInput
{
    public Guid? Id { get; set; }

    [Required]
    [MaxLength(200)]
    public string? Name { get; set; }

    [Required]
    [MaxLength(64)]
    public string? FromStageKey { get; set; }

    [Required]
    [MaxLength(64)]
    public string? ToStageKey { get; set; }

    public int SortOrder { get; set; }

    public IReadOnlyList<GateSlotUpsertInput>? Slots { get; set; }
}

public sealed class GateSlotUpsertInput
{
    [Required]
    [MaxLength(120)]
    public string? RoleLabel { get; set; }
}

/// <summary>POST /workspaces/{id}/approver-teams — add a resolved member.</summary>
public sealed class ApproverTeamAddRequest
{
    [Required]
    [MaxLength(120)]
    public string? RoleLabel { get; set; }

    /// <summary>A display name or email; resolved to a real workspace member server-side.</summary>
    [Required]
    [MaxLength(256)]
    public string? Person { get; set; }
}

/// <summary>DELETE /workspaces/{id}/approver-teams — remove a member.</summary>
public sealed class ApproverTeamRemoveRequest
{
    [Required]
    [MaxLength(120)]
    public string? RoleLabel { get; set; }

    [Required]
    public Guid UserId { get; set; }
}

// Wire contracts for the Gates / Approvals module (Slice 8 — api-contracts.md §6). Property names
// serialize to camelCase (ASP.NET Core web defaults) so they mirror /shared/types/gates.ts exactly;
// enums travel as strings via JsonStringEnumConverter. The FrozenApproverSet and DecisionsJson columns
// on ApprovalRequestRow are parsed into the nested arrays below with the same camelCase shapes, so the
// stored JSON deserializes straight into these DTOs. Approver / signer display names are PII — carried
// only in the response payload for the "Select your name" / rejection lines, never logged
// (api-pii-handling.md).

using System.ComponentModel.DataAnnotations;

namespace McDermott.AiTracker.Api.Modules.Gates;

// ─── Responses ────────────────────────────────────────────────────────────────

/// <summary>One eligible approver frozen into a slot (userId + displayName). Mirrors ApproverTeamMemberDto.</summary>
public sealed class ApproverMemberDto
{
    public string UserId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
}

/// <summary>A frozen approver slot — its team/role label plus the members eligible at gate-open.</summary>
public sealed class FrozenApproverSlotDto
{
    public int SlotIndex { get; set; }
    public string RoleLabel { get; set; } = string.Empty;
    public string DisplayLabel { get; set; } = string.Empty;
    public List<ApproverMemberDto> EligibleMembers { get; set; } = new();
}

/// <summary>One decision on a slot. A superseded rejection is retained as history.</summary>
public sealed class ApprovalDecisionDto
{
    public int SlotIndex { get; set; }
    public string Decision { get; set; } = string.Empty;
    public string? DecidedByUserId { get; set; }
    public string? DecidedByName { get; set; }
    public string? DecidedAt { get; set; }
    public string? Comment { get; set; }
    public bool IsProxy { get; set; }
    public bool Superseded { get; set; }
}

/// <summary>A gate in flight — one ApprovalRequest per gate firing. Mirrors ApprovalRequestDto in gates.ts.</summary>
public sealed record ApprovalRequestDto(
    string Id,
    string RequestRecordId,
    string GateDefinitionId,
    string GateName,
    string FromStage,
    string ToStage,
    string State,
    DateTime OpenedAt,
    DateTime? ResolvedAt,
    DateOnly? RespondByDate,
    IReadOnlyList<FrozenApproverSlotDto> Slots,
    IReadOnlyList<ApprovalDecisionDto> Decisions);

// ─── Request bodies ─────────────────────────────────────────────────────────────

/// <summary>POST /approval-requests/{id}/decisions.</summary>
public class ApprovalDecisionRequest
{
    [Range(0, int.MaxValue)]
    public int SlotIndex { get; set; }

    /// <summary>The name the acting team member picked. Must be in the frozen eligible set + a current member.</summary>
    [Required]
    public Guid DecidedByUserId { get; set; }

    [Required]
    [RegularExpression("^(Approved|Rejected)$")]
    public string? Decision { get; set; }

    /// <summary>Required when Decision = Rejected (server returns 400 rejection-requires-comment otherwise).</summary>
    public string? Comment { get; set; }
}

/// <summary>POST /approval-requests/{id}/re-request.</summary>
public sealed class ReRequestApprovalRequest
{
    [Range(0, int.MaxValue)]
    public int SlotIndex { get; set; }
}

/// <summary>POST /approval-requests/{id}/proxy-decision — Workspace admin only (BS §7.3).</summary>
public sealed class ProxyApprovalDecisionRequest : ApprovalDecisionRequest
{
    /// <summary>Why/where the off-platform sign-off happened. Recorded in the audit event, not the decision row.</summary>
    [Required]
    [MaxLength(2000)]
    public string? ProxyContext { get; set; }
}

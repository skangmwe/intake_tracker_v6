// Wire contracts for the S29 Users & access members admin (api-contracts §2). Property names
// serialize to camelCase (ASP.NET Core web defaults) so they match /shared/types/identity.ts.
// DisplayName / Email are PII — returned only to a WorkspaceAdmin of the workspace, never logged
// (api-pii-handling.md).

using System.ComponentModel.DataAnnotations;

namespace McDermott.AiTracker.Api.Modules.Users;

/// <summary>Response for GET /api/v1/workspaces/{id}/members.</summary>
public sealed record MembersListDto(IReadOnlyList<WorkspaceMemberDto> Members);

/// <summary>
/// One S29 row — a real member OR a pending invitation. <see cref="Status"/> is Active / Suspended /
/// Invited. For an invitation row <see cref="UserId"/> / <see cref="DisplayName"/> /
/// <see cref="LastActiveAt"/> are null and <see cref="InvitationId"/> is set (used by the cancel
/// action); for a member row <see cref="InvitationId"/> is null.
/// </summary>
public sealed record WorkspaceMemberDto(
    Guid? UserId,
    string? DisplayName,
    string Email,
    string Level,
    bool IsDisabled,
    DateTime? LastActiveAt,
    string Status,
    Guid? InvitationId);

/// <summary>
/// Response for POST /api/v1/workspaces/{id}/members. <see cref="Outcome"/> is "Member" (added or
/// level-changed against an existing user) or "Invited" (a pending invitation was created for an
/// email with no account yet).
/// </summary>
public sealed record MembershipUpsertResponse(string Outcome);

/// <summary>
/// Body for POST /api/v1/workspaces/{id}/members. Exactly one of <see cref="UserId"/> /
/// <see cref="Email"/> must be supplied — the controller rejects both-or-neither with 400.
/// </summary>
public sealed class MembershipUpsertRequest : IValidatableObject
{
    public Guid? UserId { get; set; }

    [MaxLength(320)]
    [EmailAddress(ErrorMessage = "Enter a valid email address.")]
    public string? Email { get; set; }

    [Required]
    [RegularExpression("^(Viewer|Member|WorkspaceAdmin)$",
        ErrorMessage = "Level must be Viewer, Member, or WorkspaceAdmin.")]
    public string? Level { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        var hasUserId = UserId.HasValue;
        var hasEmail = !string.IsNullOrWhiteSpace(Email);
        if (hasUserId == hasEmail)
        {
            yield return new ValidationResult(
                "Supply exactly one of a user id or an email address.",
                new[] { nameof(UserId), nameof(Email) });
        }
    }
}

/// <summary>
/// Body for POST /api/v1/workspaces/{id}/members/{userId}/suspension. <see cref="Suspended"/> true
/// disables the account (Status → Suspended, membership kept); false reactivates it (Status → Active).
/// </summary>
public sealed class MemberSuspensionRequest
{
    [Required]
    public bool? Suspended { get; set; }
}

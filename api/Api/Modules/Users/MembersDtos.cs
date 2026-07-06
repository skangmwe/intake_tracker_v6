// Wire contracts for the S29 Users & access members admin (api-contracts §2). Property names
// serialize to camelCase (ASP.NET Core web defaults) so they match /shared/types/identity.ts.
// DisplayName / Email are PII — returned only to a WorkspaceAdmin of the workspace, never logged
// (api-pii-handling.md).

using System.ComponentModel.DataAnnotations;

namespace McDermott.AiTracker.Api.Modules.Users;

/// <summary>Response for GET /api/v1/workspaces/{id}/members.</summary>
public sealed record MembersListDto(IReadOnlyList<WorkspaceMemberDto> Members);

public sealed record WorkspaceMemberDto(
    Guid UserId,
    string DisplayName,
    string Email,
    string Level,
    bool IsDisabled,
    DateTime LastActiveAt);

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

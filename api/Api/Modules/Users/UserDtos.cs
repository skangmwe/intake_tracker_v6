// Wire contracts for the Users module. Property names serialize to camelCase (ASP.NET Core
// web defaults) so they match /shared/types/identity.ts exactly. DisplayName / Email are PII
// returned only to the caller about themselves — never logged (api-pii-handling.md).

using System.ComponentModel.DataAnnotations;

namespace McDermott.AiTracker.Api.Modules.Users;

/// <summary>Caller identity + every workspace membership. Response for GET /api/v1/users/me.</summary>
public sealed record MeDto(
    UserDto User,
    IReadOnlyList<WorkspaceMembershipDto> Memberships,
    bool IsPlatformAdmin,
    Guid? BoundDashboardId);

public sealed record UserDto(
    Guid Id,
    string DisplayName,
    string Email,
    DateTime LastSignInAt,
    bool IsDisabled,
    string Theme);

public sealed record WorkspaceMembershipDto(
    Guid WorkspaceId,
    string WorkspaceName,
    string WorkspaceKind,
    string WorkspacePrefix,
    string Level,
    bool IsDashboardViewer,
    Guid? BoundDashboardId);

/// <summary>Body for POST /api/v1/users/me/theme.</summary>
public sealed class ThemeUpdateRequest
{
    [Required]
    [RegularExpression("^(light|dark)$", ErrorMessage = "Theme must be 'light' or 'dark'.")]
    public string? Theme { get; set; }
}

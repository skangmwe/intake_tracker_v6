// Wire contracts for workspace provisioning (Slice 19 — api-contracts §2, S38). Property names
// serialize to camelCase (ASP.NET Core web defaults) so they mirror /shared/types/identity.ts
// (WorkspaceProvisionRequest) and /shared/types/platform.ts (WorkspaceProvisionResult).

using System.ComponentModel.DataAnnotations;

namespace McDermott.AiTracker.Api.Modules.Workspaces;

/// <summary>Body for POST /api/v1/workspaces — clone the PG/Dept template into a new PG workspace.</summary>
public sealed class WorkspaceProvisionRequest
{
    [Required]
    [MaxLength(200)]
    public string? Name { get; set; }

    /// <summary>Globally unique; upper-cased and validated against the PrefixRegistry.</summary>
    [Required]
    [MaxLength(16)]
    [RegularExpression("^[A-Za-z0-9]{2,16}$", ErrorMessage = "Prefix must be 2–16 letters or digits.")]
    public string? Prefix { get; set; }

    [Required]
    public Guid InitialAdminUserId { get; set; }
}

/// <summary>The provisioned workspace summary (mirrors WorkspaceProvisionResult).</summary>
public sealed record WorkspaceProvisionResponse(Guid Id, string Name, string Kind, string Prefix);

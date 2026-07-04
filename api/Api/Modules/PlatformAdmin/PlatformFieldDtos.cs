// Request contracts for the Platform field schema surface (S34). The response DTO
// (PlatformFieldDto) lives in the Fields module because it also appears in a workspace's
// read-only band (WorkspaceFieldSchemaDto); it matches /shared/types/fields.ts.

using System.ComponentModel.DataAnnotations;

namespace McDermott.AiTracker.Api.Modules.PlatformAdmin;

/// <summary>Body for PATCH /api/v1/platform/fields/{fieldKey}. System fields cannot be edited (§4.3).</summary>
public sealed class PlatformFieldPatchRequest
{
    [Required]
    [MaxLength(200)]
    public string? DisplayName { get; set; }

    /// <summary>Option values for a Select platform field; null leaves the option set unchanged.</summary>
    public IReadOnlyList<string>? SelectOptions { get; set; }
}

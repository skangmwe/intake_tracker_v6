// Wire contracts for the TypedLinks module (Slice 10 — api-contracts.md §9). Property names
// serialize to camelCase (ASP.NET Core web defaults) so they mirror /shared/types/typed-links.ts.
// Record names carried on TypedLinkDto are Confidential — never logged (api-pii-handling.md).

using System.ComponentModel.DataAnnotations;

namespace McDermott.AiTracker.Api.Modules.TypedLinks;

/// <summary>GET /records/{id}/links row / POST /records/{id}/links response. The far record's
/// name + stage are null when the caller cannot see the far side (id-only disclosure, BS §22.6).</summary>
public sealed record TypedLinkDto(
    Guid Id,
    string FromRecordId,
    string ToRecordId,
    string Kind,
    string? Rationale,
    string? ToName,
    string? ToStage,
    DateTime CreatedAt);

/// <summary>POST /records/{id}/links body.</summary>
public sealed class AddLinkRequest
{
    [Required]
    [MaxLength(20)]
    public string? ToRecordId { get; set; }

    [Required]
    [RegularExpression("^(related|duplicate-of|re-pursuit-of|sourced-from)$")]
    public string? Kind { get; set; }

    public string? Rationale { get; set; }
}

/// <summary>POST /records/{id}/copy body.</summary>
public sealed class CopyRequest
{
    [Required]
    public Guid TargetWorkspaceId { get; set; }

    /// <summary>Accepted now; attachment carry-across lands with the Attachments object (slice 11).</summary>
    public bool IncludeAttachments { get; set; }

    /// <summary>Optional link back — 'related' or 're-pursuit-of' — queued on the new draft.</summary>
    [RegularExpression("^(related|re-pursuit-of)$")]
    public string? LinkBackKind { get; set; }
}

/// <summary>201 response for Copy — the new draft's id.</summary>
public sealed record CopyResult(Guid DraftId);

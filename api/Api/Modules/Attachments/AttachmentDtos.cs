// Wire contracts for the Attachments module (Slice 11 — api-contracts.md §8). Property names
// serialize to camelCase (ASP.NET Core web defaults) so they mirror AttachmentDto /
// AttachmentLinkRequest in /shared/types/collaboration.ts exactly. File names are Confidential-
// adjacent (they can name a client artifact) — never logged (api-pii-handling.md).

using System.ComponentModel.DataAnnotations;

namespace McDermott.AiTracker.Api.Modules.Attachments;

// ─── Responses ────────────────────────────────────────────────────────────────

/// <summary>One attachment on a record (native upload or external link). Mirrors AttachmentDto.</summary>
public sealed record AttachmentDto(
    Guid Id,
    string RecordId,
    string ObjectType,
    string FileName,
    string ContentType,
    long SizeBytes,
    bool IsLink,
    string? ExternalUrl,
    DateTime UploadedAt,
    Guid UploadedBy,
    string ContentUrl);

// ─── Request bodies ─────────────────────────────────────────────────────────────

/// <summary>POST /records/{id}/attachments/link — attach an external URL (no upload).</summary>
public sealed class AttachmentLinkRequest
{
    [Required]
    [MaxLength(2048)]
    public string? Url { get; set; }

    [Required]
    [MaxLength(400)]
    public string? Title { get; set; }
}

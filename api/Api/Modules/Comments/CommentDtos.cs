// Wire contracts for the Comments & activity-thread module (Slice 6 — api-contracts.md §7).
// Property names serialize to camelCase (ASP.NET Core web defaults) so they mirror the union in
// /shared/types/collaboration.ts exactly; enums travel as strings. Comment bodies and mention lists
// are Confidential — never logged (api-pii-handling.md). Comments are immutable: no PATCH/DELETE DTO.

using System.ComponentModel.DataAnnotations;

namespace McDermott.AiTracker.Api.Modules.Comments;

// ─── Responses ────────────────────────────────────────────────────────────────

/// <summary>A single posted comment (immutable — BS §9.3). Mirrors CommentDto in collaboration.ts.</summary>
public sealed record CommentDto(
    Guid Id,
    string RecordId,
    string ObjectType,
    Guid AuthorUserId,
    string Body,
    IReadOnlyList<Guid> MentionedUserIds,
    DateTime CreatedAt);

/// <summary>An audit-event projection for the activity thread. Mirrors AuditEventItem in collaboration.ts.</summary>
public sealed record AuditEventItemDto(
    string EventType,
    DateTime EventAt,
    Guid? ActorUserId,
    string Summary);

/// <summary>
/// One interleaved thread item. Exactly one of Comment / Event is set, per Kind
/// ('comment' | 'event') — mirrors the ActivityThreadItem union in collaboration.ts.
/// </summary>
public sealed record ActivityThreadItemDto(
    string Kind,
    CommentDto? Comment,
    AuditEventItemDto? Event);

// ─── Request bodies ─────────────────────────────────────────────────────────────

/// <summary>POST /records/{id}/comments. mentionedUserIds are already-resolved user ids (BS §11.2).</summary>
public sealed class CommentCreateRequest
{
    [Required]
    [MaxLength(8000)]
    public string? Body { get; set; }

    /// <summary>Resolved @mention targets (Entra oids). Drives the fan-out payload; delivery is slice 12.</summary>
    public IReadOnlyList<Guid>? MentionedUserIds { get; set; }
}

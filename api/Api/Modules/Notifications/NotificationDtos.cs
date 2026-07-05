// Wire contracts for the Notifications module (Slice 12 — api-contracts.md §13). Property names
// serialize to camelCase (ASP.NET Core web defaults) so they mirror /shared/types/notifications.ts.
// Summary is built from record id + category (no PII); ids travel as strings via the default Guid
// serialization.

using System.ComponentModel.DataAnnotations;

namespace McDermott.AiTracker.Api.Modules.Notifications;

// ─── Responses ────────────────────────────────────────────────────────────────

/// <summary>One bell notification. Mirrors NotificationDto in notifications.ts.</summary>
public sealed record NotificationDto(
    Guid Id,
    string Category,
    string? RecordId,
    Guid? AnnouncementId,
    string Summary,
    DateTime CreatedAt,
    DateTime? ReadAt,
    Guid SourceEventId);

/// <summary>The bell badge count. Mirrors UnreadCountDto in notifications.ts.</summary>
public sealed record UnreadCountDto(int Count);

// ─── Request bodies ─────────────────────────────────────────────────────────────

/// <summary>POST /notifications/query — the paginated bell feed. Mirrors NotificationQuery.</summary>
public sealed class NotificationQuery
{
    [Range(1, int.MaxValue)]
    public int Page { get; set; } = 1;

    [Range(1, 100)]
    public int PageSize { get; set; } = 20;

    public bool UnreadOnly { get; set; }
}

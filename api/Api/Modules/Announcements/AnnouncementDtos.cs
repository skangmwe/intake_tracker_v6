// Wire contracts for the Announcements module (Slice 13 — api-contracts.md §12). Property names
// serialize to camelCase (ASP.NET Core web defaults) so they mirror /shared/types/announcements.ts.
// Announcement title/body are broadcast notice text (Audience Level B/C, §2.7) — not matter content —
// but are never logged (api-logging.md keeps content out of logs regardless).

using System.ComponentModel.DataAnnotations;

namespace McDermott.AiTracker.Api.Modules.Announcements;

// ─── Shared shapes ──────────────────────────────────────────────────────────────

/// <summary>Two-layer audience (§10.2). Mirrors AnnouncementAudience in announcements.ts.</summary>
public sealed record AnnouncementAudience(
    string Kind,
    IReadOnlyList<string>? RoleLabels,
    IReadOnlyList<string>? UserIds);

// ─── Responses ──────────────────────────────────────────────────────────────────

/// <summary>Full announcement detail (S21). Mirrors AnnouncementDto. <c>Status</c> is the derived
/// display status (Active / Scheduled / Archived); the lifecycle timestamps let the editor pre-fill.</summary>
public sealed record AnnouncementDto(
    Guid Id,
    Guid WorkspaceId,
    string Title,
    string Body,
    AnnouncementAudience Audience,
    bool Pinned,
    DateOnly? ExpiresOn,
    string Status,
    Guid Author,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? PublishedAt,
    DateTime? ScheduledPublishAt,
    bool AutoArchive,
    DateTime? AutoArchiveAt);

/// <summary>A list/browse row (S22/S23). Mirrors AnnouncementListRow. <c>Status</c> is the derived display
/// status; <c>AuthorName</c> and <c>PostedAt</c> feed the manage table's POSTED BY / POSTED columns.</summary>
public sealed record AnnouncementListRow(
    Guid Id,
    string Title,
    string BodySnippet,
    bool Pinned,
    DateTime? PublishedAt,
    string Status,
    Guid Author,
    DateTime? ScheduledPublishAt,
    bool AutoArchive,
    DateTime? AutoArchiveAt,
    string? AuthorName,
    DateTime? PostedAt);

// ─── Request bodies ───────────────────────────────────────────────────────────────

/// <summary>Create an announcement. Mirrors AnnouncementCreateRequest. <c>Author</c> ("posted by") may be
/// any workspace member (validated in the controller); empty defaults to the acting admin. <c>Status</c>
/// is 'Active' (publish now) or 'Scheduled' (publish at <c>ScheduledPublishAt</c>).</summary>
public sealed class AnnouncementCreateRequest
{
    [Required]
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [Required]
    public string Body { get; set; } = string.Empty;

    [Required]
    public AnnouncementAudience Audience { get; set; } = new("everyone", null, null);

    public bool Pinned { get; set; }

    public DateOnly? ExpiresOn { get; set; }

    /// <summary>The poster. Empty → the acting admin.</summary>
    public Guid Author { get; set; }

    /// <summary>'Active' (publish now) or 'Scheduled'. Empty → 'Active'.</summary>
    public string Status { get; set; } = "Active";

    /// <summary>Required and future when <c>Status</c> = 'Scheduled'.</summary>
    public DateTime? ScheduledPublishAt { get; set; }

    /// <summary>Auto-archive 30 days after publish. Defaults on.</summary>
    public bool AutoArchive { get; set; } = true;
}

/// <summary>Replace the editable field set (PATCH). Mirrors AnnouncementPatchRequest.</summary>
public sealed class AnnouncementPatchRequest
{
    [Required]
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [Required]
    public string Body { get; set; } = string.Empty;

    [Required]
    public AnnouncementAudience Audience { get; set; } = new("everyone", null, null);

    public bool Pinned { get; set; }

    public DateOnly? ExpiresOn { get; set; }

    /// <summary>The poster. Empty → the acting admin.</summary>
    public Guid Author { get; set; }

    /// <summary>'Active' (publish now) or 'Scheduled'. Empty → 'Active'.</summary>
    public string Status { get; set; } = "Active";

    /// <summary>Required and future when <c>Status</c> = 'Scheduled'.</summary>
    public DateTime? ScheduledPublishAt { get; set; }

    /// <summary>Auto-archive 30 days after publish. Defaults on.</summary>
    public bool AutoArchive { get; set; } = true;
}

/// <summary>POST …/query — the paginated list body. Mirrors the firm query envelope.</summary>
public sealed class AnnouncementQuery
{
    [Range(1, int.MaxValue)]
    public int Page { get; set; } = 1;

    [Range(1, 100)]
    public int PageSize { get; set; } = 20;
}

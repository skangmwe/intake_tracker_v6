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

// ─── Platform broadcast (platform-admin only) ───────────────────────────────────

/// <summary>A workspace the caller may broadcast to (GET /platform/workspaces). Mirrors PlatformWorkspaceDto.</summary>
public sealed record PlatformWorkspaceDto(Guid Id, string Name, string Kind);

/// <summary>Broadcast target — 'all' or 'specific' + workspace ids. Mirrors PlatformAnnouncementTarget.</summary>
public sealed class PlatformAnnouncementTarget
{
    /// <summary>'all' (every non-template workspace) or 'specific'.</summary>
    public string Kind { get; set; } = "all";

    /// <summary>Required (non-empty) when Kind = 'specific'.</summary>
    public IReadOnlyList<Guid>? WorkspaceIds { get; set; }
}

/// <summary>Create a platform broadcast. Mirrors PlatformAnnouncementCreateRequest. Audience is implicitly
/// everyone and the poster is the acting admin — neither is on the wire.</summary>
public sealed class PlatformAnnouncementCreateRequest
{
    [Required]
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [Required]
    public string Body { get; set; } = string.Empty;

    public bool Pinned { get; set; }

    /// <summary>'Active' (publish now) or 'Scheduled'. Empty → 'Active'.</summary>
    public string Status { get; set; } = "Active";

    /// <summary>Required and future when Status = 'Scheduled'.</summary>
    public DateTime? ScheduledPublishAt { get; set; }

    /// <summary>Auto-archive 30 days after publish. Defaults on.</summary>
    public bool AutoArchive { get; set; } = true;

    [Required]
    public PlatformAnnouncementTarget Target { get; set; } = new();
}

/// <summary>Edit a broadcast's content across every copy (targets are fixed). Mirrors PlatformAnnouncementPatchRequest.</summary>
public sealed class PlatformAnnouncementPatchRequest
{
    [Required]
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [Required]
    public string Body { get; set; } = string.Empty;

    public bool Pinned { get; set; }

    public string Status { get; set; } = "Active";

    public DateTime? ScheduledPublishAt { get; set; }

    public bool AutoArchive { get; set; } = true;
}

/// <summary>POST /platform/announcements → created broadcast summary. Mirrors PlatformAnnouncementCreatedDto.</summary>
public sealed record PlatformAnnouncementCreatedDto(Guid BroadcastId, int WorkspaceCount);

/// <summary>One grouped broadcast row (one per BroadcastId). Mirrors PlatformAnnouncementRow.</summary>
public sealed record PlatformAnnouncementRow(
    Guid BroadcastId,
    string Title,
    string Body,
    bool Pinned,
    string Status,
    Guid Author,
    string? AuthorName,
    DateTime? PostedAt,
    DateTime? ScheduledPublishAt,
    bool AutoArchive,
    DateTime? AutoArchiveAt,
    int WorkspaceCount);

// Wire contracts for the Toolkit module (Slice 29 — v2-reconciliation.md §API deltas Toolkit).
// Property names serialize to camelCase (ASP.NET Core web defaults) so they mirror
// /shared/types/toolkit.ts exactly; enums (Kind, Status) travel as strings. Free-text values
// (name, one-liner, description, body, maintainer, file names) are Confidential — never logged
// (api-pii-handling.md). The create/patch request bodies ride the multipart JSON `payload` part.

using System.ComponentModel.DataAnnotations;

namespace McDermott.AiTracker.Api.Modules.Toolkit;

// ─── Responses ────────────────────────────────────────────────────────────────

/// <summary>Metadata for an item's uploaded file (mirrors ToolkitAttachmentInfo). Null for paste-only.</summary>
public sealed record ToolkitAttachmentInfoDto(
    string FileName,
    string ContentType,
    long SizeBytes,
    string DownloadUrl);

/// <summary>GET /toolkit/{id} — the full item (mirrors ToolkitItemDto in toolkit.ts).</summary>
public sealed record ToolkitItemDto(
    string Id,
    Guid WorkspaceId,
    string Kind,
    string Status,
    string Name,
    string? OneLiner,
    string? Description,
    string? Maintainer,
    string? HowTo,
    string? BodyMarkdown,
    ToolkitAttachmentInfoDto? Attachment,
    DateTime LastModifiedAt,
    string LastModifiedBy,
    DateTime CreatedAt,
    string CreatedBy,
    bool IsRetired,
    string ETag);

/// <summary>A single row on the S43 list/gallery (mirrors ToolkitItemListRow).</summary>
public sealed record ToolkitItemListRowDto(
    string Id,
    string Kind,
    string Status,
    string Name,
    string? OneLiner,
    string? Maintainer,
    bool HasAttachment,
    DateTime LastModifiedAt,
    string LastModifiedBy,
    string ETag);

// ─── Request bodies (the multipart JSON `payload` part) ──────────────────────────

/// <summary>POST /workspaces/{id}/toolkit — create an item (Member+ in the item's workspace).</summary>
public sealed class ToolkitItemCreateRequest
{
    /// <summary>Playbook · Plugin · Prompt. Required.</summary>
    [Required]
    [MaxLength(20)]
    public string? Kind { get; set; }

    /// <summary>Active · Draft · Archived. Optional — defaults to Draft server-side.</summary>
    [MaxLength(20)]
    public string? Status { get; set; }

    [Required]
    [MaxLength(200)]
    public string? Name { get; set; }

    [MaxLength(300)]
    public string? OneLiner { get; set; }

    [MaxLength(2000)]
    public string? Description { get; set; }

    [MaxLength(200)]
    public string? Maintainer { get; set; }

    [MaxLength(2000)]
    public string? HowTo { get; set; }

    /// <summary>Pasted asset content. Omit when the item is attachment-only.</summary>
    public string? BodyMarkdown { get; set; }
}

/// <summary>PATCH /toolkit/{id}. Sparse — only changed fields are sent.</summary>
public sealed class ToolkitItemPatchRequest
{
    [MaxLength(20)]
    public string? Kind { get; set; }

    [MaxLength(20)]
    public string? Status { get; set; }

    [MaxLength(200)]
    public string? Name { get; set; }

    [MaxLength(300)]
    public string? OneLiner { get; set; }

    [MaxLength(2000)]
    public string? Description { get; set; }

    [MaxLength(200)]
    public string? Maintainer { get; set; }

    [MaxLength(2000)]
    public string? HowTo { get; set; }

    public string? BodyMarkdown { get; set; }

    /// <summary>Remove the current attachment (paste-only). Ignored when a new file is uploaded.</summary>
    public bool RemoveAttachment { get; set; }

    /// <summary>ETag from the last-loaded item (base64 RowVer). The If-Match header takes precedence.</summary>
    public string? IfMatch { get; set; }
}

// ─── Keyless projection row (read via usp_GetToolkitItemForUser) ─────────────────

/// <summary>The detail read shape. Registered keyless in AppDbContext; never a table of its own.</summary>
public sealed class ToolkitItemRow
{
    public string RecordId { get; set; } = string.Empty;
    public Guid WorkspaceId { get; set; }
    public string Kind { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? OneLiner { get; set; }
    public string? Description { get; set; }
    public string? Maintainer { get; set; }
    public string? HowTo { get; set; }
    public string? BodyMarkdown { get; set; }
    public string? AttachmentBlobPath { get; set; }
    public string? AttachmentFileName { get; set; }
    public string? AttachmentContentType { get; set; }
    public long? AttachmentSizeBytes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;
    public bool IsDeleted { get; set; }
    public byte[] RowVer { get; set; } = Array.Empty<byte>();
}

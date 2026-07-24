// Wire contracts for the Saved Views module (Slice 14 — api-contracts.md §15). Property names
// serialize to camelCase (ASP.NET Core web defaults) so they mirror the SavedView types in
// /shared/types/notifications.ts. A saved view is presentation metadata over an already access-
// filtered list — it never widens access (BS §22.4). Columns / filters / sort ride open shapes.

using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using McDermott.AiTracker.Api.Modules.Requests;

namespace McDermott.AiTracker.Api.Modules.SavedViews;

/// <summary>One sort directive on a saved view — column key + direction (mirrors the TS sort entry).</summary>
public sealed record SavedViewSortEntry(string Column, string Direction);

/// <summary>A saved view (mirrors SavedViewDto in notifications.ts).</summary>
public sealed record SavedViewResponse(
    Guid Id,
    Guid WorkspaceId,
    string ObjectType,
    string Name,
    string Scope,
    bool IsDefault,
    IReadOnlyList<string> Columns,
    IReadOnlyDictionary<string, JsonElement> Filters,
    IReadOnlyList<SavedViewSortEntry> Sort,
    Guid OwnerUserId,
    string CreatedBy,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>POST /workspaces/{id}/saved-views or PATCH /saved-views/{id} (mirrors SavedViewUpsertRequest).</summary>
public sealed class SavedViewUpsertRequest
{
    // The four named built-ins, or a custom object slug (lowercase, matching ObjectDefinition.ObjectKey)
    // so per-object saved views work for custom objects. Validity of a slug is app-enforced, not checked
    // here — a stray saved view is inert and never widens access (BS §22.4).
    [Required]
    [RegularExpression("^(Request|Feature|Task|Announcement|[a-z0-9][a-z0-9-]{0,63})$")]
    public string? ObjectType { get; set; }

    [Required]
    [MaxLength(200)]
    public string? Name { get; set; }

    [Required]
    [RegularExpression("^(personal|shared)$")]
    public string? Scope { get; set; }

    public bool? IsDefault { get; set; }

    public IReadOnlyList<string>? Columns { get; set; }

    /// <summary>Column key → filter clause (each clause's own shape is opaque and parsed by the surface).</summary>
    public Dictionary<string, JsonElement>? Filters { get; set; }

    /// <summary>Ordered sort directives (reuses the SortSpec shape from the Requests module).</summary>
    public IReadOnlyList<SortSpec>? Sort { get; set; }
}

// Wire contracts for the Feature Catalog module (Slice 14 — api-contracts.md §11). Property names
// serialize to camelCase (ASP.NET Core web defaults) so they mirror /shared/types/features.ts
// exactly; enums travel as strings. A feature's content-field values ride an open map (the object
// runs on the same schema engine as Requests). Free-text values are Confidential — never logged.

using System.ComponentModel.DataAnnotations;
using McDermott.AiTracker.Api.Modules.Requests;

namespace McDermott.AiTracker.Api.Modules.Features;

// ─── Responses ────────────────────────────────────────────────────────────────

/// <summary>GET /features/{id} — the full feature (mirrors FeatureDto in features.ts).</summary>
public sealed record FeatureDto(
    string Id,
    Guid WorkspaceId,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    string CreatedBy,
    string UpdatedBy,
    string Name,
    string OneLiner,
    string WhatItDoes,
    string FeatureType,
    IReadOnlyList<string> CapabilityTags,
    IReadOnlyList<string> SolutionPattern,
    IReadOnlyList<string> TechStack,
    string HowToReuse,
    string? DemoUrl,
    string? RepoUrl,
    string Owner,
    string Maturity,
    string? DataClassification,
    IReadOnlyList<string> ComplianceFlags,
    IReadOnlyList<string> SourcedFromRecordIds,
    string ETag);

/// <summary>A single row on the Feature Catalog list (S9). Mirrors FeatureListRow in features.ts.</summary>
public sealed record FeatureListRowDto(
    string Id,
    string ETag,
    string Name,
    string OneLiner,
    string FeatureType,
    IReadOnlyList<string> CapabilityTags,
    IReadOnlyList<string> TechStack,
    string Owner,
    string Maturity,
    string Origin,
    DateTime UpdatedAt,
    string? ThumbnailUrl);

/// <summary>POST /requests/{id}/add-to-catalog — the prefilled Feature draft id (mirrors AddToCatalogResult).</summary>
public sealed record AddToCatalogResultDto(Guid DraftId);

// ─── Request bodies ─────────────────────────────────────────────────────────────

/// <summary>POST /features — create a Feature (Analyst-level in the AI Solutions workspace).</summary>
public sealed class FeatureCreateRequest
{
    [Required]
    [MaxLength(400)]
    public string? Name { get; set; }

    [MaxLength(400)]
    public string? OneLiner { get; set; }

    public string? WhatItDoes { get; set; }

    /// <summary>UI/visual · Functional · Integration · Workflow · Data/reporting (§18.3). Required at create.</summary>
    [Required]
    [MaxLength(32)]
    public string? FeatureType { get; set; }

    public IReadOnlyList<string>? CapabilityTags { get; set; }

    public IReadOnlyList<string>? SolutionPattern { get; set; }

    public IReadOnlyList<string>? TechStack { get; set; }

    public string? HowToReuse { get; set; }

    [MaxLength(2000)]
    public string? DemoUrl { get; set; }

    [MaxLength(2000)]
    public string? RepoUrl { get; set; }

    /// <summary>The maintainer (a user id). Optional — a stand-alone feature may have no assigned owner yet.</summary>
    public string? Owner { get; set; }

    public string? DataClassification { get; set; }

    public IReadOnlyList<string>? ComplianceFlags { get; set; }

    /// <summary>Kinded link-backs queued on an Add-to-catalog draft — stamped as typed links at submission.</summary>
    public IReadOnlyList<QueuedLinkInput>? QueuedLinks { get; set; }
}

/// <summary>PATCH /features/{id}. Sparse — only changed fields are sent.</summary>
public sealed class FeaturePatchRequest
{
    [MaxLength(400)]
    public string? Name { get; set; }

    /// <summary>Content-field values (open map). Maturity is not edited here — it has its own endpoints.</summary>
    public Dictionary<string, System.Text.Json.JsonElement>? Fields { get; set; }

    /// <summary>ETag from the last-loaded feature (base64 RowVer). The If-Match header takes precedence.</summary>
    public string? IfMatch { get; set; }
}

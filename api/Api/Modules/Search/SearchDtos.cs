// Search DTOs (Slice 15 — api-contracts.md §14). The response shapes mirror SearchHitDto /
// SearchResultDto in /shared/types/notifications.ts; the request body mirrors the §14 full-search
// payload. Property names serialise to camelCase (ASP.NET web defaults), matching the SPA client.

namespace McDermott.AiTracker.Api.Modules.Search;

/// <summary>A top-bar records-only hit — mirrors SearchHitDto in notifications.ts.</summary>
public sealed record SearchHitDto(
    string RecordId,
    string Name,
    string? Stage,
    string? Origin);

/// <summary>
/// A full-search hit — mirrors SearchResultDto in notifications.ts. Carries the parent record's
/// identity plus what matched (record / comment / attachment filename) and a plain-text snippet the
/// UI highlights client-side (SQL never emits HTML — no injection surface).
/// </summary>
public sealed record SearchResultDto(
    string RecordId,
    string Name,
    string? Stage,
    string? Origin,
    string MatchKind,
    string Snippet);

/// <summary>POST /api/v1/search/full body (api-contracts.md §14).</summary>
public sealed class SearchFullRequest
{
    public string? Query { get; set; }

    public Guid WorkspaceId { get; set; }

    public int Page { get; set; } = 1;

    public int PageSize { get; set; } = 20;
}

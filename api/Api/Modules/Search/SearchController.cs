// Search endpoints (Slice 15 — api-contracts.md §14). The controller only routes / validates / maps
// (api-coding-standards.md — no business logic). Access is resolved inside the procs the service
// calls: both gate on workspace membership and return an empty set for a non-member, so search
// "returns only what you can see" and never discloses existence (BS §9.5 / §22.6) — there is no 403
// here. Every authenticated caller may search; the results are the access boundary.
//
// Per api-contracts §14 the quick search is a GET with query params (the term is not sensitive) and
// the full search is a POST with a JSON body.

using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Search;

[ApiController]
[Route("api/v1")]
public sealed class SearchController : ControllerBase
{
    /// <summary>The top-bar workspace search surfaces at most six records (BS §9.5).</summary>
    private const int QuickSearchTop = 6;

    /// <summary>Pagination ceiling (api/CLAUDE.md — requests above 100 are rejected, never clamped).</summary>
    private const int MaxPageSize = 100;

    private readonly ISearchService _search;
    private readonly ICurrentUser _currentUser;

    public SearchController(ISearchService search, ICurrentUser currentUser)
    {
        _search = search;
        _currentUser = currentUser;
    }

    /// <summary>Records-only quick search — up to six access-respecting hits for the top bar.</summary>
    [HttpGet("search")]
    [ProducesResponseType(typeof(IReadOnlyList<SearchHitDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Search(
        [FromQuery(Name = "q")] string? q,
        [FromQuery] Guid workspaceId,
        CancellationToken cancellationToken)
    {
        var hits = await _search.SearchRecordsAsync(
            workspaceId, _currentUser.UserId, q, QuickSearchTop, cancellationToken);
        return Ok(hits);
    }

    /// <summary>Full search (S27) across fields, comments, and attachment filenames — paginated.</summary>
    [HttpPost("search/full")]
    [ProducesResponseType(typeof(PaginatedResponse<SearchResultDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> SearchFull(
        [FromBody] SearchFullRequest request,
        CancellationToken cancellationToken)
    {
        if (request.PageSize > MaxPageSize)
        {
            return ValidationFailure(new Dictionary<string, string[]>
            {
                ["pageSize"] = new[] { $"Page size can't exceed {MaxPageSize}." },
            });
        }

        var page = await _search.SearchFullAsync(
            request.WorkspaceId, _currentUser.UserId, request.Query, request.Page, request.PageSize, cancellationToken);
        return Ok(page);
    }

    private ObjectResult ValidationFailure(IReadOnlyDictionary<string, string[]> errors) =>
        new(new ValidationProblemDetails(errors.ToDictionary(entry => entry.Key, entry => entry.Value))
        {
            Type = "https://mws.ai/errors/validation",
            Title = "The request is not valid.",
            Status = StatusCodes.Status400BadRequest,
            Detail = "One or more fields need attention.",
        })
        {
            StatusCode = StatusCodes.Status400BadRequest,
            ContentTypes = { "application/problem+json" },
        };
}

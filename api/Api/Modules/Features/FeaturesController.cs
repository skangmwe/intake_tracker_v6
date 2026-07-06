// Feature Catalog endpoints (Slice 14 — api-contracts.md §11). Features are AI-Solutions-workspace-
// only; the workspace is resolved server-side (no workspace in the path). The controller routes,
// authorizes at the boundary where it can, and maps the service outcome to a status code — no
// business logic (api-coding-standards.md). Ownership/level violations and non-existent records both
// return 403, never 404 (BS §22.6). The list query uses POST (not the contract's stray "GET /query")
// to match the established POST …/query body convention (api/CLAUDE.md — no complex query strings).

using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Features;

[ApiController]
[Route("api/v1")]
public sealed class FeaturesController : ControllerBase
{
    private readonly IFeaturesService _features;
    private readonly ICurrentUser _currentUser;

    public FeaturesController(IFeaturesService features, ICurrentUser currentUser)
    {
        _features = features;
        _currentUser = currentUser;
    }

    /// <summary>The Feature Catalog list — filter/sort/page payload (AI-workspace Viewer+).</summary>
    [HttpPost("features/query")]
    [ProducesResponseType(typeof(PaginatedResponse<FeatureListRowDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> QueryFeatures([FromBody] PaginatedQuery query, CancellationToken cancellationToken)
    {
        var page = await _features.QueryAsync(_currentUser.UserId, query, cancellationToken);
        return page is null ? AccessDenied() : Ok(page);
    }

    /// <summary>The full feature (S10). Access is baked into the read — no row means 403 (never 404).</summary>
    [HttpGet("features/{recordId}")]
    [ProducesResponseType(typeof(FeatureDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetFeature([FromRoute] string recordId, CancellationToken cancellationToken)
    {
        var feature = await _features.GetByIdAsync(recordId, _currentUser.UserId, cancellationToken);
        return feature is null ? AccessDenied() : Ok(feature);
    }

    /// <summary>Create a Feature (Analyst / Member+ in the AI Solutions workspace).</summary>
    [HttpPost("features")]
    [ProducesResponseType(typeof(FeatureDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> CreateFeature([FromBody] FeatureCreateRequest request, CancellationToken cancellationToken)
    {
        var result = await _features.CreateAsync(request, _currentUser.UserId, OperationId(), cancellationToken);
        return result.Outcome switch
        {
            FeatureWriteOutcome.Success => Created($"/api/v1/features/{result.Feature!.Id}", result.Feature),
            FeatureWriteOutcome.NoHubWorkspace => HubUnavailable(),
            _ => AccessDenied(),
        };
    }

    /// <summary>Partial edit of a feature's content (Member+ on the AI Solutions workspace).</summary>
    [HttpPatch("features/{recordId}")]
    [ProducesResponseType(typeof(FeatureDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> UpdateFeature(
        [FromRoute] string recordId, [FromBody] FeaturePatchRequest request, CancellationToken cancellationToken)
    {
        var result = await _features.PatchAsync(recordId, request, ResolveIfMatch(request.IfMatch), _currentUser.UserId, OperationId(), cancellationToken);
        return MapWrite(result);
    }

    /// <summary>Publish a feature (Maturity → Published). An ordinary member edit — no gate (BS §18.5).</summary>
    [HttpPost("features/{recordId}/publish")]
    [ProducesResponseType(typeof(FeatureDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> PublishFeature([FromRoute] string recordId, CancellationToken cancellationToken)
    {
        var result = await _features.SetMaturityAsync(recordId, "Published", _currentUser.UserId, OperationId(), cancellationToken);
        return MapWrite(result);
    }

    /// <summary>Deprecate a feature (Maturity → Deprecated). Never hard-deleted.</summary>
    [HttpPost("features/{recordId}/deprecate")]
    [ProducesResponseType(typeof(FeatureDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> DeprecateFeature([FromRoute] string recordId, CancellationToken cancellationToken)
    {
        var result = await _features.SetMaturityAsync(recordId, "Deprecated", _currentUser.UserId, OperationId(), cancellationToken);
        return MapWrite(result);
    }

    /// <summary>Prefill a Feature draft from a shipped Request (BS §5); stamps a sourced-from link on submit.</summary>
    [HttpPost("requests/{recordId}/add-to-catalog")]
    [ProducesResponseType(typeof(AddToCatalogResultDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> AddToCatalog([FromRoute] string recordId, CancellationToken cancellationToken)
    {
        var result = await _features.AddToCatalogAsync(recordId, _currentUser.UserId, cancellationToken);
        return result.Outcome switch
        {
            AddToCatalogOutcome.Success => Created($"/api/v1/drafts/{result.DraftId}", new AddToCatalogResultDto(result.DraftId!.Value)),
            AddToCatalogOutcome.NoHubWorkspace => HubUnavailable(),
            _ => AccessDenied(),
        };
    }

    private IActionResult MapWrite(FeatureWriteResult result) => result.Outcome switch
    {
        FeatureWriteOutcome.Success => Ok(result.Feature),
        FeatureWriteOutcome.Stale => StaleConflict(),
        FeatureWriteOutcome.NoHubWorkspace => HubUnavailable(),
        _ => AccessDenied(),
    };

    private string? ResolveIfMatch(string? bodyIfMatch)
    {
        var header = Request.Headers.IfMatch.ToString();
        return !string.IsNullOrWhiteSpace(header) ? header.Trim().Trim('"') : bodyIfMatch;
    }

    private string OperationId() =>
        HttpContext.Items.TryGetValue(OperationIdMiddleware.HeaderName, out var value) && value is string operationId
            ? operationId
            : string.Empty;

    private ObjectResult AccessDenied() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/access-denied",
            Title = "Access denied.",
            Status = StatusCodes.Status403Forbidden,
            Detail = "You do not have access to this feature.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult StaleConflict() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/stale-record",
            Title = "The record changed.",
            Status = StatusCodes.Status409Conflict,
            Detail = "This feature was changed by someone else since you loaded it. Refresh and reapply your edits.",
        })
        {
            StatusCode = StatusCodes.Status409Conflict,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult HubUnavailable() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/hub-unavailable",
            Title = "The Feature Catalog is unavailable.",
            Status = StatusCodes.Status503ServiceUnavailable,
            Detail = "The AI Solutions workspace is not provisioned. Contact an administrator.",
        })
        {
            StatusCode = StatusCodes.Status503ServiceUnavailable,
            ContentTypes = { "application/problem+json" },
        };
}

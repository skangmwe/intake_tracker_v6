// Saved Views endpoints (Slice 14 — api-contracts.md §15). The list + create paths are workspace-
// scoped and authorize against the route workspace here; edit + delete are id-scoped and authorize
// inside the service (personal → owner, shared → WorkspaceAdmin). objectType scopes a view to one
// list surface so a Request view never appears on the Feature picker. No business logic in the
// controller (api-coding-standards.md) — it maps the service outcome to a status code.

using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.SavedViews;

[ApiController]
[Route("api/v1")]
public sealed class SavedViewsController : ControllerBase
{
    private readonly ISavedViewsService _savedViews;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public SavedViewsController(ISavedViewsService savedViews, IAccessGuard accessGuard, ICurrentUser currentUser)
    {
        _savedViews = savedViews;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>Saved views for a list surface — shared + the caller's own personal (Viewer+).</summary>
    [HttpGet("workspaces/{workspaceId:guid}/saved-views")]
    [ProducesResponseType(typeof(IReadOnlyList<SavedViewResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> ListSavedViews(
        [FromRoute] Guid workspaceId,
        [FromQuery(Name = "objectType")] string? objectType,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        var surface = string.IsNullOrWhiteSpace(objectType) ? "Request" : objectType;
        var views = await _savedViews.ListAsync(workspaceId, surface, _currentUser.UserId, cancellationToken);
        return Ok(views);
    }

    /// <summary>Create a saved view — personal (Member+) or shared (WorkspaceAdmin).</summary>
    [HttpPost("workspaces/{workspaceId:guid}/saved-views")]
    [ProducesResponseType(typeof(SavedViewResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> CreateSavedView(
        [FromRoute] Guid workspaceId,
        [FromBody] SavedViewUpsertRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _savedViews.CreateAsync(workspaceId, request, _currentUser.UserId, cancellationToken);
        return result.Outcome switch
        {
            SavedViewWriteOutcome.Success => Created($"/api/v1/saved-views/{result.View!.Id}", result.View),
            _ => AccessDenied(),
        };
    }

    /// <summary>Edit a saved view (personal → owner; shared → WorkspaceAdmin).</summary>
    [HttpPatch("saved-views/{savedViewId:guid}")]
    [ProducesResponseType(typeof(SavedViewResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateSavedView(
        [FromRoute] Guid savedViewId,
        [FromBody] SavedViewUpsertRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _savedViews.UpdateAsync(savedViewId, request, _currentUser.UserId, cancellationToken);
        return result.Outcome switch
        {
            SavedViewWriteOutcome.Success => Ok(result.View),
            SavedViewWriteOutcome.NotFound => NotFoundProblem(),
            _ => AccessDenied(),
        };
    }

    /// <summary>Soft-delete a saved view (personal → owner; shared → WorkspaceAdmin). Never touches records.</summary>
    [HttpDelete("saved-views/{savedViewId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteSavedView([FromRoute] Guid savedViewId, CancellationToken cancellationToken)
    {
        var outcome = await _savedViews.DeleteAsync(savedViewId, _currentUser.UserId, cancellationToken);
        return outcome switch
        {
            SavedViewWriteOutcome.Success => NoContent(),
            SavedViewWriteOutcome.NotFound => NotFoundProblem(),
            _ => AccessDenied(),
        };
    }

    private ObjectResult AccessDenied() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/access-denied",
            Title = "Access denied.",
            Status = StatusCodes.Status403Forbidden,
            Detail = "You do not have access to this saved view.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult NotFoundProblem() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/not-found",
            Title = "Saved view not found.",
            Status = StatusCodes.Status404NotFound,
            Detail = "This saved view no longer exists.",
        })
        {
            StatusCode = StatusCodes.Status404NotFound,
            ContentTypes = { "application/problem+json" },
        };
}

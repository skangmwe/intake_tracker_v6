// Drafts endpoints (Slice 5 — owner-scoped personal state). Every action operates on the current
// user's own drafts; access is enforced by the @OwnerUserId boundary in each stored procedure, so a
// draft that does not exist or belongs to someone else is denied uniformly with 403 (never 404 — a
// non-owner is never told a draft exists). The controller only routes/validates and maps the
// service result to a status code (api-coding-standards.md).

using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Requests;

[ApiController]
[Route("api/v1")]
public sealed class DraftsController : ControllerBase
{
    private readonly IDraftsService _drafts;
    private readonly ICurrentUser _currentUser;

    public DraftsController(IDraftsService drafts, ICurrentUser currentUser)
    {
        _drafts = drafts;
        _currentUser = currentUser;
    }

    /// <summary>Create (omit id) or update (include id) the caller's own draft.</summary>
    [HttpPost("workspaces/{workspaceId:guid}/drafts")]
    [ProducesResponseType(typeof(DraftDto), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(DraftDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> SaveDraft(
        [FromRoute] Guid workspaceId,
        [FromBody] DraftSaveRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _drafts.SaveAsync(workspaceId, _currentUser.UserId, request, cancellationToken);
        return result.Created
            ? Created($"/api/v1/drafts/{result.Draft.Id}", result.Draft)
            : Ok(result.Draft);
    }

    /// <summary>The caller's own drafts for a workspace, newest-edited first.</summary>
    [HttpGet("workspaces/{workspaceId:guid}/drafts")]
    [ProducesResponseType(typeof(IReadOnlyList<DraftListRow>), StatusCodes.Status200OK)]
    public async Task<IActionResult> ListDrafts([FromRoute] Guid workspaceId, CancellationToken cancellationToken)
    {
        var drafts = await _drafts.ListAsync(workspaceId, _currentUser.UserId, cancellationToken);
        return Ok(drafts);
    }

    /// <summary>One draft by id — the caller's own only (not yours → 403).</summary>
    [HttpGet("drafts/{draftId:guid}")]
    [ProducesResponseType(typeof(DraftDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetDraft([FromRoute] Guid draftId, CancellationToken cancellationToken)
    {
        var draft = await _drafts.GetAsync(draftId, _currentUser.UserId, cancellationToken);
        return draft is null ? AccessDenied() : Ok(draft);
    }

    /// <summary>Discard the caller's own draft (hard delete; not yours → 403).</summary>
    [HttpDelete("drafts/{draftId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> DeleteDraft([FromRoute] Guid draftId, CancellationToken cancellationToken)
    {
        var deleted = await _drafts.DeleteAsync(draftId, _currentUser.UserId, cancellationToken);
        return deleted ? NoContent() : AccessDenied();
    }

    private ObjectResult AccessDenied() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/access-denied",
            Title = "Access denied.",
            Status = StatusCodes.Status403Forbidden,
            Detail = "You do not have access to this draft.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };
}

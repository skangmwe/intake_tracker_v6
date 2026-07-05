// Watchers endpoints (Slice 12 — api-contracts.md §10). Record-scoped paths off /api/v1. The
// controller only routes / maps the service result to a status code (api-coding-standards.md — no
// business logic in controllers). Access is resolved in the service against the record's own
// workspace: a forbidden OR non-existent record both map to 403, never 404 (BS §22.6).

using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Watchers;

[ApiController]
[Route("api/v1")]
public sealed class WatchersController : ControllerBase
{
    private readonly IWatchersService _watchers;
    private readonly ICurrentUser _currentUser;

    public WatchersController(IWatchersService watchers, ICurrentUser currentUser)
    {
        _watchers = watchers;
        _currentUser = currentUser;
    }

    /// <summary>List a record's live watchers + the caller's own subscription state.</summary>
    [HttpGet("records/{recordId}/watchers")]
    [ProducesResponseType(typeof(WatcherListDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetWatchers([FromRoute] string recordId, CancellationToken cancellationToken)
    {
        var result = await _watchers.GetAsync(recordId, _currentUser.UserId, cancellationToken);
        return result is null ? AccessDenied() : Ok(result);
    }

    /// <summary>Subscribe the caller (or another user, if WorkspaceAdmin) to the record. Idempotent.</summary>
    [HttpPost("records/{recordId}/watchers")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> AddWatcher(
        [FromRoute] string recordId,
        [FromBody] AddWatcherRequest? request,
        CancellationToken cancellationToken)
    {
        var outcome = await _watchers.AddAsync(recordId, request?.UserId, _currentUser.UserId, cancellationToken);
        return outcome == WatcherOutcome.Forbidden ? AccessDenied() : NoContent();
    }

    /// <summary>Unsubscribe a user. The caller may remove themselves; a WorkspaceAdmin may remove anyone.</summary>
    [HttpDelete("records/{recordId}/watchers/{userId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> RemoveWatcher(
        [FromRoute] string recordId,
        [FromRoute] Guid userId,
        CancellationToken cancellationToken)
    {
        var outcome = await _watchers.RemoveAsync(recordId, userId, _currentUser.UserId, cancellationToken);
        return outcome == WatcherOutcome.Forbidden ? AccessDenied() : NoContent();
    }

    private ObjectResult AccessDenied() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/access-denied",
            Title = "Access denied.",
            Status = StatusCodes.Status403Forbidden,
            Detail = "You do not have access to this record.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };
}

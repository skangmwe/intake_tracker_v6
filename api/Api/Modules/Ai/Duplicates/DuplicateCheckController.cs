// On-demand duplicate check (Phase 4, §14). Two endpoints on a request record: rank likely duplicates, and
// confirm-as-duplicate (which reuses the existing close / typed-link / event-spine mechanisms). The controller
// only routes / validates / authorizes and maps the service result (api-coding-standards.md): it enforces the
// off-switch (workspace AiAssistEnabled → 403 when off, no provider work) and Viewer membership on the route
// workspace; the service owns the authoritative per-record permission gates. Access violations return 403, never
// 404 (api-error-handling.md).

using McDermott.AiTracker.Api.Modules.Ai.Config;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Ai.Duplicates;

[ApiController]
[Route("api/v1/workspaces/{workspaceId:guid}/ai")]
public sealed class DuplicateCheckController : ControllerBase
{
    private readonly IDuplicateCheckService _duplicates;
    private readonly IAiConfigService _config;
    private readonly IRequestsService _requests;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public DuplicateCheckController(
        IDuplicateCheckService duplicates,
        IAiConfigService config,
        IRequestsService requests,
        IAccessGuard accessGuard,
        ICurrentUser currentUser)
    {
        _duplicates = duplicates;
        _config = config;
        _requests = requests;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>Rank the caller-visible likely duplicates of a record. Any member; disabled → 403.</summary>
    [HttpPost("duplicate-check/{recordId}")]
    [ProducesResponseType(typeof(IReadOnlyList<DuplicateCandidate>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Check(
        [FromRoute] Guid workspaceId,
        [FromRoute] string recordId,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        if (!(await _config.GetAsync(workspaceId, cancellationToken)).Enabled)
        {
            return AiDisabled();
        }

        // Re-check the subject on the caller's side — a forbidden / missing record is a 403, never a 404.
        if (await _requests.GetByIdAsync(recordId, _currentUser.UserId, cancellationToken) is null)
        {
            return AccessDenied();
        }

        var candidates = await _duplicates.CheckAsync(workspaceId, _currentUser.UserId, recordId, cancellationToken);

        Response.Headers.CacheControl = "private, no-store";
        return Ok(candidates);
    }

    /// <summary>Confirm the record as a duplicate — closes it as Duplicate, writes the duplicate-of link, notifies.</summary>
    [HttpPost("duplicate-check/{recordId}/confirm")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Confirm(
        [FromRoute] Guid workspaceId,
        [FromRoute] string recordId,
        [FromBody] ConfirmDuplicateRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        if (!(await _config.GetAsync(workspaceId, cancellationToken)).Enabled)
        {
            return AiDisabled();
        }

        if (string.IsNullOrWhiteSpace(request.DuplicateOfRecordId) || string.IsNullOrWhiteSpace(request.Rationale))
        {
            return ConfirmInvalid();
        }

        var result = await _duplicates.ConfirmAsync(
            workspaceId, _currentUser.UserId, recordId, request.DuplicateOfRecordId, request.Rationale, OperationId(), cancellationToken);

        return result.Outcome switch
        {
            ConfirmDuplicateOutcome.Confirmed => NoContent(),
            ConfirmDuplicateOutcome.TargetInvalid => ConfirmInvalid(),
            _ => AccessDenied(),
        };
    }

    private string OperationId() =>
        HttpContext.Items.TryGetValue(OperationIdMiddleware.HeaderName, out var value) && value is string operationId
            ? operationId
            : string.Empty;

    private ObjectResult AccessDenied() =>
        Problem("https://mws.ai/errors/access-denied", "Access denied.",
            "You do not have access to this request.", StatusCodes.Status403Forbidden);

    private ObjectResult AiDisabled() =>
        Problem("https://mws.ai/errors/access-denied", "AI assist is turned off.",
            "AI assist is turned off for this workspace. Ask a workspace admin to enable it.", StatusCodes.Status403Forbidden);

    private ObjectResult ConfirmInvalid() =>
        Problem("https://mws.ai/errors/validation", "The duplicate could not be confirmed.",
            "Choose a valid record to mark this as a duplicate of, and add a reason.", StatusCodes.Status400BadRequest);

    private static ObjectResult Problem(string type, string title, string detail, int status) =>
        new(new ProblemDetails { Type = type, Title = title, Status = status, Detail = detail })
        {
            StatusCode = status,
            ContentTypes = { "application/problem+json" },
        };
}

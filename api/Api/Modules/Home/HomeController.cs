// Home endpoint (Slice 22 — api-contracts.md §16). One GET returns the composite per-user landing
// (BS §10.7), scoped to the active workspace passed as ?workspaceId= (the panels are workspace-specific
// and the SPA resolves an active workspace everywhere). The controller only routes / authorizes and maps
// the service result (api-coding-standards.md — no business logic). The single authoritative access check
// is workspace membership (Viewer+); a non-member gets 403, never a disclosing 404.

using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Home;

[ApiController]
[Route("api/v1")]
public sealed class HomeController : ControllerBase
{
    private readonly IHomeService _home;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public HomeController(IHomeService home, IAccessGuard accessGuard, ICurrentUser currentUser)
    {
        _home = home;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>The caller's Home for the active workspace (BS §10.7). 403 when not a member.</summary>
    [HttpGet("home")]
    [ProducesResponseType(typeof(HomeDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Get([FromQuery] Guid workspaceId, CancellationToken cancellationToken)
    {
        if (workspaceId == Guid.Empty)
        {
            return MissingWorkspace();
        }

        if (!await _accessGuard.HasWorkspaceLevelAsync(
                _currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        var home = await _home.GetHomeAsync(workspaceId, _currentUser.UserId, cancellationToken);
        return Ok(home);
    }

    // A plain ObjectResult (not ControllerBase.ValidationProblem, which needs a ProblemDetailsFactory
    // from request services and returns a derived BadRequestObjectResult) — mirrors AccessDenied so the
    // shape is uniform and unit-testable without the MVC service graph.
    private ObjectResult MissingWorkspace() =>
        new(new ValidationProblemDetails(new Dictionary<string, string[]>
        {
            ["workspaceId"] = new[] { "A workspace is required." },
        })
        {
            Type = "https://mws.ai/errors/validation",
            Title = "The request is not valid.",
            Status = StatusCodes.Status400BadRequest,
        })
        {
            StatusCode = StatusCodes.Status400BadRequest,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult AccessDenied() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/access-denied",
            Title = "Access denied.",
            Status = StatusCodes.Status403Forbidden,
            Detail = "You do not have access to this workspace.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };
}

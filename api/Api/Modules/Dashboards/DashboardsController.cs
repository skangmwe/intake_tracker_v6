// Dashboards endpoints (Slice 23 — api-contracts.md §15). The workspace-scoped list authorizes against
// the route workspace here (Viewer+); the id-scoped read + patch authorize inside the service (Viewer+
// or a bound Dashboard-viewer on read; WorkspaceAdmin on patch). No business logic in the controller
// (api-coding-standards.md) — it maps the service outcome to a status code. An inaccessible dashboard is
// 403, an unknown id is 404 (api-record-access.md); the service determines existence before access.
// Cache-Control: private, no-store is applied by CacheControlMiddleware — never re-added per action.

using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Dashboards;

[ApiController]
[Route("api/v1")]
public sealed class DashboardsController : ControllerBase
{
    private readonly IDashboardsService _dashboards;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public DashboardsController(IDashboardsService dashboards, IAccessGuard accessGuard, ICurrentUser currentUser)
    {
        _dashboards = dashboards;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>Dashboards visible in the workspace (S17 + S32 management, Viewer+).</summary>
    [HttpGet("workspaces/{workspaceId:guid}/dashboards")]
    [ProducesResponseType(typeof(DashboardListResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> ListDashboards(
        [FromRoute] Guid workspaceId,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        var list = await _dashboards.ListAsync(workspaceId, _currentUser.UserId, cancellationToken);
        return Ok(list);
    }

    /// <summary>One dashboard with every widget resolved to the caller. Drill-through filters the embedded grid (S6).</summary>
    [HttpGet("dashboards/{dashboardId:guid}")]
    [ProducesResponseType(typeof(SavedDashboardResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetDashboard(
        [FromRoute] Guid dashboardId,
        [FromQuery(Name = "drill")] string? drill,
        CancellationToken cancellationToken)
    {
        var result = await _dashboards.GetAsync(dashboardId, _currentUser.UserId, drill, cancellationToken);
        return result.Outcome switch
        {
            DashboardOutcome.Success => Ok(result.Dashboard),
            DashboardOutcome.NotFound => NotFoundProblem(),
            _ => AccessDenied(),
        };
    }

    /// <summary>Edit a dashboard's audience / name, or retire it (S32 shared-dashboards management, WorkspaceAdmin).</summary>
    [HttpPatch("dashboards/{dashboardId:guid}")]
    [ProducesResponseType(typeof(SavedDashboardResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateDashboard(
        [FromRoute] Guid dashboardId,
        [FromBody] DashboardPatchRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _dashboards.UpdateAsync(dashboardId, request, _currentUser.UserId, cancellationToken);
        return result.Outcome switch
        {
            DashboardOutcome.Success => Ok(result.Dashboard),
            DashboardOutcome.NotFound => NotFoundProblem(),
            _ => AccessDenied(),
        };
    }

    private ObjectResult AccessDenied() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/access-denied",
            Title = "Access denied.",
            Status = StatusCodes.Status403Forbidden,
            Detail = "You do not have access to this dashboard.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult NotFoundProblem() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/not-found",
            Title = "Dashboard not found.",
            Status = StatusCodes.Status404NotFound,
            Detail = "This dashboard no longer exists.",
        })
        {
            StatusCode = StatusCodes.Status404NotFound,
            ContentTypes = { "application/problem+json" },
        };
}

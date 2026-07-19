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
        return MapResult(result);
    }

    /// <summary>Create a user-composed dashboard (S6 "New dashboard", slice 28). WorkspaceAdmin for Shared, Member+ for Personal.</summary>
    [HttpPost("workspaces/{workspaceId:guid}/dashboards")]
    [ProducesResponseType(typeof(SavedDashboardResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> CreateDashboard(
        [FromRoute] Guid workspaceId,
        [FromBody] DashboardComposeRequest request,
        CancellationToken cancellationToken)
    {
        var errors = ValidateCompose(request);
        if (errors is not null)
        {
            return ValidationProblem(new ValidationProblemDetails(errors));
        }

        var result = await _dashboards.CreateAsync(workspaceId, request, _currentUser.UserId, cancellationToken);
        return result.Outcome == DashboardOutcome.Success
            ? StatusCode(StatusCodes.Status201Created, result.Dashboard)
            : MapResult(result);
    }

    /// <summary>Append a widget to a composed dashboard (slice 28). Seeded dashboards → 403 seeded-dashboard-read-only.</summary>
    [HttpPost("dashboards/{dashboardId:guid}/widgets")]
    [ProducesResponseType(typeof(SavedDashboardResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> AddWidget(
        [FromRoute] Guid dashboardId,
        [FromBody] WidgetComposeRequest request,
        CancellationToken cancellationToken)
    {
        var errors = ValidateWidget(request);
        if (errors is not null)
        {
            return ValidationProblem(new ValidationProblemDetails(errors));
        }

        var result = await _dashboards.AddWidgetAsync(dashboardId, request, _currentUser.UserId, cancellationToken);
        return MapResult(result);
    }

    /// <summary>Update one widget on a composed dashboard by id (slice 28).</summary>
    [HttpPatch("dashboards/{dashboardId:guid}/widgets/{widgetId:guid}")]
    [ProducesResponseType(typeof(SavedDashboardResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateWidget(
        [FromRoute] Guid dashboardId,
        [FromRoute] Guid widgetId,
        [FromBody] WidgetComposeRequest request,
        CancellationToken cancellationToken)
    {
        var errors = ValidateWidget(request);
        if (errors is not null)
        {
            return ValidationProblem(new ValidationProblemDetails(errors));
        }

        var result = await _dashboards.UpdateWidgetAsync(dashboardId, widgetId, request, _currentUser.UserId, cancellationToken);
        return MapResult(result);
    }

    /// <summary>Remove one widget from a composed dashboard by id (slice 28).</summary>
    [HttpDelete("dashboards/{dashboardId:guid}/widgets/{widgetId:guid}")]
    [ProducesResponseType(typeof(SavedDashboardResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteWidget(
        [FromRoute] Guid dashboardId,
        [FromRoute] Guid widgetId,
        CancellationToken cancellationToken)
    {
        var result = await _dashboards.DeleteWidgetAsync(dashboardId, widgetId, _currentUser.UserId, cancellationToken);
        return MapResult(result);
    }

    private IActionResult MapResult(DashboardReadResult result) =>
        result.Outcome switch
        {
            DashboardOutcome.Success => Ok(result.Dashboard),
            DashboardOutcome.NotFound => NotFoundProblem(),
            DashboardOutcome.SeededReadOnly => SeededReadOnlyProblem(),
            _ => AccessDenied(),
        };

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

    private ObjectResult SeededReadOnlyProblem() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/seeded-dashboard-read-only",
            Title = "Seeded dashboard is read-only.",
            Status = StatusCodes.Status403Forbidden,
            Detail = "This is a seeded dashboard. Create your own dashboard to compose widgets.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };

    // ── Boundary validation (api-validation.md — validate at the controller edge) ──
    private static readonly HashSet<string> ComposerWidgetTypes =
        new(StringComparer.Ordinal) { "kpi-tile", "bar-breakdown", "segmented-bar", "records-grid" };
    private static readonly HashSet<string> ComposerMetrics =
        new(StringComparer.Ordinal) { "count", "unassigned", "overdue", "high-priority" };
    private static readonly HashSet<string> ComposerDimensions =
        new(StringComparer.Ordinal) { "origin", "stage", "analyst", "priority" };
    private static readonly HashSet<string> Visibilities =
        new(StringComparer.Ordinal) { "Shared", "Personal" };
    private static readonly HashSet<string> ObjectTypes =
        new(StringComparer.Ordinal) { "Request", "Feature" };
    private static readonly HashSet<string> WidgetWidths =
        new(StringComparer.Ordinal) { "Half", "Full" };

    private static Dictionary<string, string[]>? ValidateCompose(DashboardComposeRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            errors["name"] = new[] { "A dashboard name is required." };
        }

        if (request.Visibility is { } visibility && !Visibilities.Contains(visibility))
        {
            errors["visibility"] = new[] { "Visibility must be Shared or Personal." };
        }

        if (request.ObjectType is { } objectType && !ObjectTypes.Contains(objectType))
        {
            errors["objectType"] = new[] { "Object type must be Request or Feature." };
        }

        if (request.Widgets is { } widgets)
        {
            for (var index = 0; index < widgets.Count; index++)
            {
                var widgetErrors = ValidateWidget(widgets[index]);
                if (widgetErrors is null)
                {
                    continue;
                }

                foreach (var pair in widgetErrors)
                {
                    errors[$"widgets[{index}].{pair.Key}"] = pair.Value;
                }
            }
        }

        return errors.Count == 0 ? null : errors;
    }

    private static Dictionary<string, string[]>? ValidateWidget(WidgetComposeRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.Title))
        {
            errors["title"] = new[] { "A widget title is required." };
        }

        if (string.IsNullOrWhiteSpace(request.Type) || !ComposerWidgetTypes.Contains(request.Type))
        {
            errors["type"] = new[] { "Unsupported widget type." };
        }

        if (request.Width is { } width && !WidgetWidths.Contains(width))
        {
            errors["width"] = new[] { "Width must be Half or Full." };
        }

        switch (request.Type)
        {
            case "kpi-tile":
                if (string.IsNullOrWhiteSpace(request.Metric) || !ComposerMetrics.Contains(request.Metric))
                {
                    errors["metric"] = new[] { "A KPI widget needs a valid metric." };
                }

                break;
            case "bar-breakdown":
            case "segmented-bar":
                if (string.IsNullOrWhiteSpace(request.GroupByDimension) || !ComposerDimensions.Contains(request.GroupByDimension))
                {
                    errors["groupByDimension"] = new[] { "A breakdown widget needs a valid group-by dimension." };
                }

                break;
            case "records-grid":
                if (request.RowLimit is { } limit and (< 1 or > 100))
                {
                    errors["rowLimit"] = new[] { "Rows shown must be between 1 and 100." };
                }

                break;
        }

        return errors.Count == 0 ? null : errors;
    }
}

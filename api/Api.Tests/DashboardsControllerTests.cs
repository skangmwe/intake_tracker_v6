// Unit tests for DashboardsController (routing / access gate / status-code mapping — the service and
// access guard are mocked). Covers the Viewer+ gate on the workspace list (200 / 403, service never
// reached on denial), the id-scoped read + patch outcome mapping (Success→200, NotFound→404, Denied→403),
// and cancellation propagation (api-testing-guidelines.md). DB-backed behaviours (widget resolution,
// bound-viewer no-drill, WorkspaceAdmin on patch) are asserted at the service/proc level; here we prove
// the controller maps the service outcome faithfully — an inaccessible dashboard is 403, never a
// disclosing 404 (api-record-access.md).

using System.Text.Json;
using McDermott.AiTracker.Api.Modules.Dashboards;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class DashboardsControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid WorkspaceId = Guid.NewGuid();
    private static readonly Guid DashboardId = Guid.NewGuid();

    private static JsonElement Everyone()
    {
        using var document = JsonDocument.Parse("{\"kind\":\"everyone\"}");
        return document.RootElement.Clone();
    }

    private static SavedDashboardResponse Sample() => new(
        DashboardId, WorkspaceId, "ai-default", "Dashboard", null, Everyone(), true, "Request", true,
        Array.Empty<DashboardWidgetResponse>(), IsSeeded: true, Visibility: "Shared", LayoutMode: "Fixed");

    private static WidgetComposeRequest ValidKpiWidget() => new()
    {
        Type = "kpi-tile",
        Title = "Open requests",
        Metric = "count",
        Width = "Half",
        SortOrder = 0,
    };

    private static DashboardsController Build(Mock<IDashboardsService> service, Mock<IAccessGuard>? guard = null)
    {
        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);
        return new DashboardsController(service.Object, (guard ?? ViewerGuard(true)).Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
    }

    private static Mock<IAccessGuard> ViewerGuard(bool isMember)
    {
        var guard = new Mock<IAccessGuard>();
        guard.Setup(check => check.HasWorkspaceLevelAsync(UserId, WorkspaceId, WorkspaceLevel.Viewer, It.IsAny<CancellationToken>()))
            .ReturnsAsync(isMember);
        return guard;
    }

    [Fact]
    public async Task ListDashboards_Member_ReturnsOk()
    {
        // Arrange
        var service = new Mock<IDashboardsService>();
        service.Setup(svc => svc.ListAsync(WorkspaceId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new DashboardListResponse(WorkspaceId, Array.Empty<DashboardListItemResponse>()));

        // Act
        var result = await Build(service).ListDashboards(WorkspaceId, CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task ListDashboards_NonMember_Returns403AndDoesNotCallService()
    {
        // Arrange
        var service = new Mock<IDashboardsService>();

        // Act
        var result = await Build(service, ViewerGuard(false)).ListDashboards(WorkspaceId, CancellationToken.None);

        // Assert — 403 (never a disclosing 404); the service is never reached.
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
        service.Verify(svc => svc.ListAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task GetDashboard_Success_ReturnsOk()
    {
        // Arrange
        var service = new Mock<IDashboardsService>();
        service.Setup(svc => svc.GetAsync(DashboardId, UserId, null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new DashboardReadResult(DashboardOutcome.Success, Sample()));

        // Act
        var result = await Build(service).GetDashboard(DashboardId, null, CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task GetDashboard_ForwardsDrillFilter()
    {
        // Arrange — the raw drill JSON string is passed through to the service verbatim.
        const string drill = "{\"type\":\"unassigned\"}";
        var service = new Mock<IDashboardsService>();
        service.Setup(svc => svc.GetAsync(DashboardId, UserId, drill, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new DashboardReadResult(DashboardOutcome.Success, Sample()));

        // Act
        var result = await Build(service).GetDashboard(DashboardId, drill, CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
        service.Verify(svc => svc.GetAsync(DashboardId, UserId, drill, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task GetDashboard_NotFound_Returns404()
    {
        // Arrange
        var service = new Mock<IDashboardsService>();
        service.Setup(svc => svc.GetAsync(DashboardId, UserId, null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new DashboardReadResult(DashboardOutcome.NotFound));

        // Act
        var result = await Build(service).GetDashboard(DashboardId, null, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status404NotFound, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task GetDashboard_Denied_Returns403()
    {
        // Arrange — an existing dashboard the caller can't see maps to 403, never 404.
        var service = new Mock<IDashboardsService>();
        service.Setup(svc => svc.GetAsync(DashboardId, UserId, null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new DashboardReadResult(DashboardOutcome.Denied));

        // Act
        var result = await Build(service).GetDashboard(DashboardId, null, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task UpdateDashboard_Success_ReturnsOk()
    {
        // Arrange
        var service = new Mock<IDashboardsService>();
        service.Setup(svc => svc.UpdateAsync(DashboardId, It.IsAny<DashboardPatchRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new DashboardReadResult(DashboardOutcome.Success, Sample()));

        // Act
        var result = await Build(service).UpdateDashboard(DashboardId, new DashboardPatchRequest { Name = "Renamed" }, CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task UpdateDashboard_NonAdmin_Returns403()
    {
        // Arrange — WorkspaceAdmin is enforced in the service; a non-admin comes back Denied.
        var service = new Mock<IDashboardsService>();
        service.Setup(svc => svc.UpdateAsync(DashboardId, It.IsAny<DashboardPatchRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new DashboardReadResult(DashboardOutcome.Denied));

        // Act
        var result = await Build(service).UpdateDashboard(DashboardId, new DashboardPatchRequest { Retire = true }, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task UpdateDashboard_NotFound_Returns404()
    {
        // Arrange
        var service = new Mock<IDashboardsService>();
        service.Setup(svc => svc.UpdateAsync(DashboardId, It.IsAny<DashboardPatchRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new DashboardReadResult(DashboardOutcome.NotFound));

        // Act
        var result = await Build(service).UpdateDashboard(DashboardId, new DashboardPatchRequest(), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status404NotFound, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task UpdateDashboard_SeededReadOnly_Returns403()
    {
        // Arrange — a composer-path edit (visibility/widgets) on a seeded dashboard.
        var service = new Mock<IDashboardsService>();
        service.Setup(svc => svc.UpdateAsync(DashboardId, It.IsAny<DashboardPatchRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new DashboardReadResult(DashboardOutcome.SeededReadOnly));

        // Act
        var result = await Build(service).UpdateDashboard(DashboardId, new DashboardPatchRequest { Visibility = "Personal" }, CancellationToken.None);

        // Assert — 403 with the seeded-dashboard-read-only problem type.
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        Assert.Equal("https://mws.ai/errors/seeded-dashboard-read-only", Assert.IsType<ProblemDetails>(problem.Value).Type);
    }

    [Fact]
    public async Task CreateDashboard_Valid_Returns201()
    {
        // Arrange
        var service = new Mock<IDashboardsService>();
        service.Setup(svc => svc.CreateAsync(WorkspaceId, It.IsAny<DashboardComposeRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new DashboardReadResult(DashboardOutcome.Success, Sample()));

        // Act
        var request = new DashboardComposeRequest { Name = "Tax delivery", Visibility = "Personal", ObjectType = "Request" };
        var result = await Build(service).CreateDashboard(WorkspaceId, request, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status201Created, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task CreateDashboard_MissingName_Returns400AndDoesNotCallService()
    {
        // Arrange
        var service = new Mock<IDashboardsService>();

        // Act — no name.
        var result = await Build(service).CreateDashboard(WorkspaceId, new DashboardComposeRequest { Visibility = "Shared" }, CancellationToken.None);

        // Assert — boundary validation blocks it before the service (ValidationProblem → 400).
        Assert.Equal(StatusCodes.Status400BadRequest, Assert.IsAssignableFrom<ObjectResult>(result).StatusCode);
        service.Verify(svc => svc.CreateAsync(It.IsAny<Guid>(), It.IsAny<DashboardComposeRequest>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task CreateDashboard_SharedByNonAdmin_Returns403()
    {
        // Arrange — service enforces WorkspaceAdmin for Shared and returns Denied.
        var service = new Mock<IDashboardsService>();
        service.Setup(svc => svc.CreateAsync(WorkspaceId, It.IsAny<DashboardComposeRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new DashboardReadResult(DashboardOutcome.Denied));

        // Act
        var request = new DashboardComposeRequest { Name = "Shared board", Visibility = "Shared" };
        var result = await Build(service).CreateDashboard(WorkspaceId, request, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task AddWidget_Valid_ReturnsOk()
    {
        // Arrange
        var service = new Mock<IDashboardsService>();
        service.Setup(svc => svc.AddWidgetAsync(DashboardId, It.IsAny<WidgetComposeRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new DashboardReadResult(DashboardOutcome.Success, Sample()));

        // Act
        var result = await Build(service).AddWidget(DashboardId, ValidKpiWidget(), CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task AddWidget_InvalidType_Returns400AndDoesNotCallService()
    {
        // Arrange
        var service = new Mock<IDashboardsService>();
        var bad = new WidgetComposeRequest { Type = "pie-chart", Title = "Bad", Width = "Half", SortOrder = 0 };

        // Act
        var result = await Build(service).AddWidget(DashboardId, bad, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status400BadRequest, Assert.IsAssignableFrom<ObjectResult>(result).StatusCode);
        service.Verify(svc => svc.AddWidgetAsync(It.IsAny<Guid>(), It.IsAny<WidgetComposeRequest>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task AddWidget_KpiWithoutMetric_Returns400()
    {
        // Arrange — a KPI widget must name a metric.
        var service = new Mock<IDashboardsService>();
        var widget = new WidgetComposeRequest { Type = "kpi-tile", Title = "No metric", Width = "Half", SortOrder = 0 };

        // Act
        var result = await Build(service).AddWidget(DashboardId, widget, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status400BadRequest, Assert.IsAssignableFrom<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task AddWidget_Seeded_Returns403SeededReadOnly()
    {
        // Arrange — the service blocks widget edits on a seeded dashboard.
        var service = new Mock<IDashboardsService>();
        service.Setup(svc => svc.AddWidgetAsync(DashboardId, It.IsAny<WidgetComposeRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new DashboardReadResult(DashboardOutcome.SeededReadOnly));

        // Act
        var result = await Build(service).AddWidget(DashboardId, ValidKpiWidget(), CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        Assert.Equal("https://mws.ai/errors/seeded-dashboard-read-only", Assert.IsType<ProblemDetails>(problem.Value).Type);
    }

    [Fact]
    public async Task DeleteWidget_NotFound_Returns404()
    {
        // Arrange — unknown widget id.
        var service = new Mock<IDashboardsService>();
        var widgetId = Guid.NewGuid();
        service.Setup(svc => svc.DeleteWidgetAsync(DashboardId, widgetId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new DashboardReadResult(DashboardOutcome.NotFound));

        // Act
        var result = await Build(service).DeleteWidget(DashboardId, widgetId, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status404NotFound, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task ListDashboards_CancellationPropagates()
    {
        // Arrange
        var service = new Mock<IDashboardsService>();
        var guard = new Mock<IAccessGuard>();
        guard.Setup(check => check.HasWorkspaceLevelAsync(UserId, WorkspaceId, WorkspaceLevel.Viewer, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(service, guard).ListDashboards(WorkspaceId, cts.Token));
    }
}

// Unit tests for WorkspacesController (S38 provisioning) — the Platform-admin gate and outcome
// mapping (service + guard mocked). Covers success 201, duplicate-prefix 409, unknown-admin 400,
// template-missing 503, non-admin 403, and cancellation.

using McDermott.AiTracker.Api.Modules.Workspaces;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class WorkspacesControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();

    private static WorkspacesController Build(Mock<IWorkspaceProvisioningService> service, bool isPlatformAdmin)
    {
        var accessGuard = new Mock<IAccessGuard>();
        accessGuard.Setup(guard => guard.IsPlatformAdminAsync(UserId, It.IsAny<CancellationToken>())).ReturnsAsync(isPlatformAdmin);

        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        var httpContext = new DefaultHttpContext();
        httpContext.Items[OperationIdMiddleware.HeaderName] = "op-abc";

        return new WorkspacesController(service.Object, accessGuard.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };
    }

    private static WorkspaceProvisionRequest Request() =>
        new() { Name = "Litigation", Prefix = "LIT", InitialAdminUserId = Guid.NewGuid() };

    [Fact]
    public async Task ProvisionWorkspace_Success_Returns201()
    {
        var service = new Mock<IWorkspaceProvisioningService>();
        var created = new WorkspaceProvisionResponse(Guid.NewGuid(), "Litigation", "pg-dept", "LIT");
        service.Setup(candidate => candidate.ProvisionAsync(It.IsAny<WorkspaceProvisionRequest>(), UserId, "op-abc", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ProvisionResult(ProvisionOutcome.Success, created));

        var result = await Build(service, isPlatformAdmin: true).ProvisionWorkspace(Request(), CancellationToken.None);

        var createdResult = Assert.IsType<CreatedResult>(result);
        Assert.Same(created, createdResult.Value);
    }

    [Fact]
    public async Task ProvisionWorkspace_NotAdmin_Returns403()
    {
        var service = new Mock<IWorkspaceProvisioningService>();

        var result = await Build(service, isPlatformAdmin: false).ProvisionWorkspace(Request(), CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        service.Verify(candidate => candidate.ProvisionAsync(It.IsAny<WorkspaceProvisionRequest>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ProvisionWorkspace_DuplicatePrefix_Returns409()
    {
        var service = new Mock<IWorkspaceProvisioningService>();
        service.Setup(candidate => candidate.ProvisionAsync(It.IsAny<WorkspaceProvisionRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ProvisionResult(ProvisionOutcome.DuplicatePrefix));

        var result = await Build(service, isPlatformAdmin: true).ProvisionWorkspace(Request(), CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, problem.StatusCode);
    }

    [Fact]
    public async Task ProvisionWorkspace_UnknownAdmin_Returns400()
    {
        var service = new Mock<IWorkspaceProvisioningService>();
        service.Setup(candidate => candidate.ProvisionAsync(It.IsAny<WorkspaceProvisionRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ProvisionResult(ProvisionOutcome.UnknownAdmin));

        var result = await Build(service, isPlatformAdmin: true).ProvisionWorkspace(Request(), CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
    }

    [Fact]
    public async Task ProvisionWorkspace_TemplateMissing_Returns503()
    {
        var service = new Mock<IWorkspaceProvisioningService>();
        service.Setup(candidate => candidate.ProvisionAsync(It.IsAny<WorkspaceProvisionRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ProvisionResult(ProvisionOutcome.TemplateMissing));

        var result = await Build(service, isPlatformAdmin: true).ProvisionWorkspace(Request(), CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, problem.StatusCode);
    }

    [Fact]
    public async Task ProvisionWorkspace_CancellationPropagates()
    {
        var service = new Mock<IWorkspaceProvisioningService>();
        service.Setup(candidate => candidate.ProvisionAsync(It.IsAny<WorkspaceProvisionRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(service, isPlatformAdmin: true).ProvisionWorkspace(Request(), cts.Token));
    }

    [Fact]
    public async Task ListWorkspaces_NotAdmin_Returns403()
    {
        var service = new Mock<IWorkspaceProvisioningService>();

        var result = await Build(service, isPlatformAdmin: false).ListWorkspaces(CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        service.Verify(candidate => candidate.ListAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ListWorkspaces_Admin_ReturnsRows()
    {
        var service = new Mock<IWorkspaceProvisioningService>();
        var rows = new List<WorkspaceListRow>
        {
            new(Guid.NewGuid(), "Litigation", "pg-dept", "LIT", "Grace Lin", 64,
                new DateTime(2026, 7, 1, 0, 0, 0, DateTimeKind.Utc), false),
        };
        service.Setup(candidate => candidate.ListAsync(It.IsAny<CancellationToken>())).ReturnsAsync(rows);

        var result = await Build(service, isPlatformAdmin: true).ListWorkspaces(CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Same(rows, ok.Value);
    }
}

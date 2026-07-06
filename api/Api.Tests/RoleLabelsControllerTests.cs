// Unit tests for RoleLabelsController (S37) — the Platform-admin gate and outcome mapping (service +
// guard mocked). Covers list, create (success / duplicate 409 / blank 400), rename (404 unknown),
// retire (204), non-admin 403, and cancellation.

using McDermott.AiTracker.Api.Modules.PlatformAdmin;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class RoleLabelsControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();

    private static RoleLabelsController Build(Mock<IRoleLabelsService> service, bool isPlatformAdmin)
    {
        var accessGuard = new Mock<IAccessGuard>();
        accessGuard.Setup(guard => guard.IsPlatformAdminAsync(UserId, It.IsAny<CancellationToken>())).ReturnsAsync(isPlatformAdmin);

        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        var httpContext = new DefaultHttpContext();
        httpContext.Items[OperationIdMiddleware.HeaderName] = "op-abc";

        return new RoleLabelsController(service.Object, accessGuard.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };
    }

    private static RoleLabelResponse Sample(string label = "InfoSec") => new(Guid.NewGuid(), label, 0);

    [Fact]
    public async Task GetRoleLabels_Admin_ReturnsOk()
    {
        var service = new Mock<IRoleLabelsService>();
        service.Setup(candidate => candidate.ListAsync(It.IsAny<CancellationToken>())).ReturnsAsync(new[] { Sample() });

        var result = await Build(service, isPlatformAdmin: true).GetRoleLabels(CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task GetRoleLabels_NotAdmin_Returns403()
    {
        var service = new Mock<IRoleLabelsService>();

        var result = await Build(service, isPlatformAdmin: false).GetRoleLabels(CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task CreateRoleLabel_Success_Returns201()
    {
        var service = new Mock<IRoleLabelsService>();
        var created = Sample("New Label");
        service.Setup(candidate => candidate.CreateAsync("New Label", UserId, "op-abc", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new RoleLabelWriteResult(RoleLabelWriteOutcome.Success, created));

        var result = await Build(service, isPlatformAdmin: true)
            .CreateRoleLabel(new RoleLabelCreateRequest { Label = "New Label" }, CancellationToken.None);

        var createdResult = Assert.IsType<CreatedResult>(result);
        Assert.Same(created, createdResult.Value);
    }

    [Fact]
    public async Task CreateRoleLabel_Duplicate_Returns409()
    {
        var service = new Mock<IRoleLabelsService>();
        service.Setup(candidate => candidate.CreateAsync(It.IsAny<string>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new RoleLabelWriteResult(RoleLabelWriteOutcome.Duplicate));

        var result = await Build(service, isPlatformAdmin: true)
            .CreateRoleLabel(new RoleLabelCreateRequest { Label = "InfoSec" }, CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, problem.StatusCode);
    }

    [Fact]
    public async Task RenameRoleLabel_Unknown_Returns404()
    {
        var service = new Mock<IRoleLabelsService>();
        var id = Guid.NewGuid();
        service.Setup(candidate => candidate.RenameAsync(id, It.IsAny<string>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new RoleLabelWriteResult(RoleLabelWriteOutcome.NotFound));

        var result = await Build(service, isPlatformAdmin: true)
            .RenameRoleLabel(id, new RoleLabelRenameRequest { Label = "X" }, CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status404NotFound, problem.StatusCode);
    }

    [Fact]
    public async Task RetireRoleLabel_Admin_Returns204()
    {
        var service = new Mock<IRoleLabelsService>();
        var id = Guid.NewGuid();

        var result = await Build(service, isPlatformAdmin: true).RetireRoleLabel(id, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        service.Verify(candidate => candidate.RetireAsync(id, UserId, "op-abc", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task CreateRoleLabel_CancellationPropagates()
    {
        var service = new Mock<IRoleLabelsService>();
        service.Setup(candidate => candidate.CreateAsync(It.IsAny<string>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(service, isPlatformAdmin: true).CreateRoleLabel(new RoleLabelCreateRequest { Label = "X" }, cts.Token));
    }
}

// Unit tests for AccessController (S36) — the Platform-admin gate and outcome mapping (service +
// guard mocked). Covers list, grant (success 204 / unresolved 400 / ambiguous 400), revoke (204),
// non-admin 403, and cancellation.

using McDermott.AiTracker.Api.Modules.PlatformAdmin;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class AccessControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();

    private static AccessController Build(Mock<IAccessGrantsService> service, bool isPlatformAdmin)
    {
        var accessGuard = new Mock<IAccessGuard>();
        accessGuard.Setup(guard => guard.IsPlatformAdminAsync(UserId, It.IsAny<CancellationToken>())).ReturnsAsync(isPlatformAdmin);

        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        var httpContext = new DefaultHttpContext();
        httpContext.Items[OperationIdMiddleware.HeaderName] = "op-abc";

        return new AccessController(service.Object, accessGuard.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };
    }

    [Fact]
    public async Task ListGrants_Admin_ReturnsOk()
    {
        var service = new Mock<IAccessGrantsService>();
        service.Setup(candidate => candidate.ListAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PrivilegedGrantsListResponse(Array.Empty<PrivilegedGrantResponse>()));

        var result = await Build(service, isPlatformAdmin: true).ListGrants(CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task ListGrants_NotAdmin_Returns403()
    {
        var service = new Mock<IAccessGrantsService>();

        var result = await Build(service, isPlatformAdmin: false).ListGrants(CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        service.Verify(candidate => candidate.ListAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task GrantAccess_Success_Returns204()
    {
        var service = new Mock<IAccessGrantsService>();
        var request = new PlatformAdminGrantRequest { Email = "dana@firm.example" };
        service.Setup(candidate => candidate.GrantAsync(request, UserId, "op-abc", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new GrantResult(GrantOutcome.Success, Guid.NewGuid(), WasAdded: true));

        var result = await Build(service, isPlatformAdmin: true).GrantAccess(request, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task GrantAccess_Unresolved_Returns400()
    {
        var service = new Mock<IAccessGrantsService>();
        var request = new PlatformAdminGrantRequest { Email = "ghost@firm.example" };
        service.Setup(candidate => candidate.GrantAsync(request, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new GrantResult(GrantOutcome.Unresolved));

        var result = await Build(service, isPlatformAdmin: true).GrantAccess(request, CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
    }

    [Fact]
    public async Task GrantAccess_Ambiguous_Returns400()
    {
        var service = new Mock<IAccessGrantsService>();
        var request = new PlatformAdminGrantRequest { Email = "Shared Name" };
        service.Setup(candidate => candidate.GrantAsync(request, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new GrantResult(GrantOutcome.Ambiguous));

        var result = await Build(service, isPlatformAdmin: true).GrantAccess(request, CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
    }

    [Fact]
    public async Task RevokeAccess_Admin_Returns204()
    {
        var service = new Mock<IAccessGrantsService>();
        var target = Guid.NewGuid();

        var result = await Build(service, isPlatformAdmin: true).RevokeAccess(target, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        service.Verify(candidate => candidate.RevokeAsync(target, UserId, "op-abc", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task GrantAccess_CancellationPropagates()
    {
        var service = new Mock<IAccessGrantsService>();
        var request = new PlatformAdminGrantRequest { Email = "dana@firm.example" };
        service.Setup(candidate => candidate.GrantAsync(request, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(service, isPlatformAdmin: true).GrantAccess(request, cts.Token));
    }
}

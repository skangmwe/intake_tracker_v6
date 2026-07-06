// Unit tests for CrossingMapController (S35) — the Platform-admin gate and read (service + guard
// mocked). Covers happy path, non-admin 403, and cancellation propagation.

using McDermott.AiTracker.Api.Modules.PlatformAdmin;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class CrossingMapControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();

    private static CrossingMapController Build(Mock<ICrossingMapService> service, bool isPlatformAdmin)
    {
        var accessGuard = new Mock<IAccessGuard>();
        accessGuard.Setup(guard => guard.IsPlatformAdminAsync(UserId, It.IsAny<CancellationToken>())).ReturnsAsync(isPlatformAdmin);

        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        return new CrossingMapController(service.Object, accessGuard.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
    }

    [Fact]
    public async Task GetCrossingMap_Admin_ReturnsOk()
    {
        // Arrange
        var service = new Mock<ICrossingMapService>();
        service.Setup(candidate => candidate.GetAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { new CrossingMapRowResponse("business-value", "Business Value", "Number", "business-value", "Business Value", "Number") });

        // Act
        var result = await Build(service, isPlatformAdmin: true).GetCrossingMap(CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task GetCrossingMap_NotAdmin_Returns403()
    {
        // Arrange
        var service = new Mock<ICrossingMapService>();

        // Act
        var result = await Build(service, isPlatformAdmin: false).GetCrossingMap(CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        service.Verify(candidate => candidate.GetAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task GetCrossingMap_CancellationPropagates()
    {
        // Arrange
        var service = new Mock<ICrossingMapService>();
        service.Setup(candidate => candidate.GetAsync(It.IsAny<CancellationToken>())).ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() => Build(service, isPlatformAdmin: true).GetCrossingMap(cts.Token));
    }
}

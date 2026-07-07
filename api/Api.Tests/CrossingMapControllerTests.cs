// Unit tests for CrossingMapController (S35) — the Platform-admin gate, read, candidates, propose and
// confirm (service + guard mocked). Covers happy paths, non-admin 403, outcome→status mapping, and
// cancellation propagation.

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

    private static CrossingMapRowResponse SampleRow(Guid? id, string status) => new(
        id, "client-name", "Client Name", "ShortText", "client-name", "Client Name", "ShortText",
        status, null, null, null);

    [Fact]
    public async Task GetCrossingMap_Admin_ReturnsOk()
    {
        // Arrange
        var service = new Mock<ICrossingMapService>();
        service.Setup(svc => svc.GetAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { SampleRow(null, "Seeded") });

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
        service.Verify(svc => svc.GetAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task GetCandidates_Admin_ReturnsOk()
    {
        // Arrange
        var service = new Mock<ICrossingMapService>();
        service.Setup(svc => svc.GetCandidatesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CrossingCandidatesResponse(Array.Empty<CrossingCandidateResponse>(), Array.Empty<CrossingCandidateResponse>()));

        // Act
        var result = await Build(service, isPlatformAdmin: true).GetCandidates(CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task Propose_Admin_Success_Returns201()
    {
        // Arrange
        var id = Guid.NewGuid();
        var service = new Mock<ICrossingMapService>();
        service.Setup(svc => svc.ProposeAsync(It.IsAny<CrossingMapProposeRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CrossingMapWriteResult(CrossingMapWriteOutcome.Success, SampleRow(id, "Proposed")));

        // Act
        var result = await Build(service, isPlatformAdmin: true)
            .Propose(new CrossingMapProposeRequest(), CancellationToken.None);

        // Assert
        Assert.IsType<CreatedResult>(result);
    }

    [Fact]
    public async Task Propose_NotAdmin_Returns403()
    {
        // Arrange
        var service = new Mock<ICrossingMapService>();

        // Act
        var result = await Build(service, isPlatformAdmin: false)
            .Propose(new CrossingMapProposeRequest(), CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        service.Verify(svc => svc.ProposeAsync(It.IsAny<CrossingMapProposeRequest>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Propose_TypeMismatch_Returns400()
    {
        // Arrange
        var service = new Mock<ICrossingMapService>();
        service.Setup(svc => svc.ProposeAsync(It.IsAny<CrossingMapProposeRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CrossingMapWriteResult(CrossingMapWriteOutcome.TypeMismatch));

        // Act
        var result = await Build(service, isPlatformAdmin: true)
            .Propose(new CrossingMapProposeRequest(), CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
    }

    [Fact]
    public async Task Propose_AlreadyMapped_Returns409()
    {
        // Arrange
        var service = new Mock<ICrossingMapService>();
        service.Setup(svc => svc.ProposeAsync(It.IsAny<CrossingMapProposeRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CrossingMapWriteResult(CrossingMapWriteOutcome.AlreadyMapped));

        // Act
        var result = await Build(service, isPlatformAdmin: true)
            .Propose(new CrossingMapProposeRequest(), CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, problem.StatusCode);
    }

    [Fact]
    public async Task Confirm_Admin_Success_ReturnsOk()
    {
        // Arrange
        var id = Guid.NewGuid();
        var service = new Mock<ICrossingMapService>();
        service.Setup(svc => svc.ConfirmAsync(id, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CrossingMapWriteResult(CrossingMapWriteOutcome.Success, SampleRow(id, "Confirmed")));

        // Act
        var result = await Build(service, isPlatformAdmin: true).Confirm(id, CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task Confirm_NotProposable_Returns409()
    {
        // Arrange
        var id = Guid.NewGuid();
        var service = new Mock<ICrossingMapService>();
        service.Setup(svc => svc.ConfirmAsync(id, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CrossingMapWriteResult(CrossingMapWriteOutcome.NotProposable));

        // Act
        var result = await Build(service, isPlatformAdmin: true).Confirm(id, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, problem.StatusCode);
    }

    [Fact]
    public async Task GetCrossingMap_CancellationPropagates()
    {
        // Arrange
        var service = new Mock<ICrossingMapService>();
        service.Setup(svc => svc.GetAsync(It.IsAny<CancellationToken>())).ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() => Build(service, isPlatformAdmin: true).GetCrossingMap(cts.Token));
    }
}

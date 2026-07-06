// Unit tests for HomeController (routing / authorization / status-code mapping — the service is mocked).
// Covers: member happy path (200 + payload), non-member (403, never 404, service never called), empty
// workspaceId (400, checked before the access gate, service never called), and cancellation propagation
// (api-testing-guidelines.md). The panel composition itself is exercised by the tSQLt proc tests and the
// HomeEndpointsTests integration test.

using McDermott.AiTracker.Api.Modules.Home;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class HomeControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid WorkspaceId = Guid.NewGuid();

    private static HomeController Build(Mock<IHomeService> home, Mock<IAccessGuard> accessGuard)
    {
        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        return new HomeController(home.Object, accessGuard.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
    }

    private static Mock<IAccessGuard> MemberGuard(bool isMember)
    {
        var guard = new Mock<IAccessGuard>();
        guard.Setup(g => g.HasWorkspaceLevelAsync(
                UserId, WorkspaceId, WorkspaceLevel.Viewer, It.IsAny<CancellationToken>()))
            .ReturnsAsync(isMember);
        return guard;
    }

    private static HomeDto EmptyHome() => new(
        WorkspaceId,
        Array.Empty<HomeDecisionItem>(), 0,
        Array.Empty<HomeWorkItem>(), 0,
        Array.Empty<HomeActivityItem>(), null,
        Array.Empty<HomeTriageItem>(), 0,
        Array.Empty<HomePinnedAnnouncement>());

    [Fact]
    public async Task Get_Member_ReturnsOkWithHome()
    {
        // Arrange
        var home = new Mock<IHomeService>();
        var payload = EmptyHome();
        home.Setup(service => service.GetHomeAsync(WorkspaceId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(payload);

        // Act
        var result = await Build(home, MemberGuard(true)).Get(WorkspaceId, CancellationToken.None);

        // Assert
        Assert.Same(payload, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Fact]
    public async Task Get_NonMember_Returns403AndDoesNotCallService()
    {
        // Arrange
        var home = new Mock<IHomeService>();

        // Act
        var result = await Build(home, MemberGuard(false)).Get(WorkspaceId, CancellationToken.None);

        // Assert — 403 (never a disclosing 404); the service is never reached.
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        home.Verify(
            service => service.GetHomeAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Get_EmptyWorkspaceId_Returns400AndDoesNotCallService()
    {
        // Arrange — the missing/empty workspace is rejected at the boundary, before the access gate.
        var home = new Mock<IHomeService>();

        // Act
        var result = await Build(home, MemberGuard(true)).Get(Guid.Empty, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
        home.Verify(
            service => service.GetHomeAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Get_CancellationPropagates()
    {
        // Arrange
        var home = new Mock<IHomeService>();
        home.Setup(service => service.GetHomeAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(home, MemberGuard(true)).Get(WorkspaceId, cts.Token));
    }
}

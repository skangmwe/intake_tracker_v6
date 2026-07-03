// Unit tests for UsersController — routing + result mapping only (the service is mocked).
// Covers happy path, the not-provisioned 404 branch, theme update success/failure, and
// cancellation-token propagation (api-testing-guidelines.md).

using McDermott.AiTracker.Api.Modules.Users;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class UsersControllerTests
{
    private static UsersController Build(IUserProfileService profiles, Guid userId)
    {
        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(candidate => candidate.UserId).Returns(userId);
        return new UsersController(profiles, currentUser.Object);
    }

    private static MeDto BuildMe(Guid id) => new(
        new UserDto(id, "Priya Raman", "priya@mws.ai", DateTime.UtcNow, false, "light"),
        new List<WorkspaceMembershipDto>(),
        IsPlatformAdmin: false,
        BoundDashboardId: null);

    [Fact]
    public async Task GetMe_ProfileFound_ReturnsOkWithBody()
    {
        // Arrange
        var id = Guid.NewGuid();
        var me = BuildMe(id);
        var profiles = new Mock<IUserProfileService>();
        profiles.Setup(service => service.GetMeAsync(id, It.IsAny<CancellationToken>())).ReturnsAsync(me);

        // Act
        var result = await Build(profiles.Object, id).GetMe(CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Same(me, ok.Value);
    }

    [Fact]
    public async Task GetMe_NotProvisioned_Returns404ProblemDetails()
    {
        // Arrange
        var id = Guid.NewGuid();
        var profiles = new Mock<IUserProfileService>();
        profiles.Setup(service => service.GetMeAsync(id, It.IsAny<CancellationToken>())).ReturnsAsync((MeDto?)null);

        // Act
        var result = await Build(profiles.Object, id).GetMe(CancellationToken.None);

        // Assert
        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(404, objectResult.StatusCode);
        Assert.IsType<ProblemDetails>(objectResult.Value);
    }

    [Fact]
    public async Task UpdateTheme_Success_Returns204()
    {
        // Arrange
        var id = Guid.NewGuid();
        var profiles = new Mock<IUserProfileService>();
        profiles.Setup(service => service.UpdateThemeAsync(id, "dark", It.IsAny<CancellationToken>())).ReturnsAsync(true);

        // Act
        var result = await Build(profiles.Object, id).UpdateTheme(new ThemeUpdateRequest { Theme = "dark" }, CancellationToken.None);

        // Assert
        Assert.IsType<NoContentResult>(result);
        profiles.Verify(service => service.UpdateThemeAsync(id, "dark", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task UpdateTheme_NoUserRow_Returns404()
    {
        // Arrange
        var id = Guid.NewGuid();
        var profiles = new Mock<IUserProfileService>();
        profiles.Setup(service => service.UpdateThemeAsync(id, "light", It.IsAny<CancellationToken>())).ReturnsAsync(false);

        // Act
        var result = await Build(profiles.Object, id).UpdateTheme(new ThemeUpdateRequest { Theme = "light" }, CancellationToken.None);

        // Assert
        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(404, objectResult.StatusCode);
    }

    [Fact]
    public async Task GetMe_ForwardsCancellationToken()
    {
        // Arrange
        var id = Guid.NewGuid();
        using var cts = new CancellationTokenSource();
        var profiles = new Mock<IUserProfileService>();
        profiles.Setup(service => service.GetMeAsync(id, cts.Token)).ReturnsAsync(BuildMe(id));

        // Act
        await Build(profiles.Object, id).GetMe(cts.Token);

        // Assert — the exact token flowed through to the service.
        profiles.Verify(service => service.GetMeAsync(id, cts.Token), Times.Once);
    }
}

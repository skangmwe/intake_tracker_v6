using McDermott.AiTracker.Api.Modules.Ai.Config;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public class AiConfigControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid WorkspaceId = Guid.NewGuid();

    private readonly Mock<IAiConfigService> _service = new();
    private readonly Mock<IAccessGuard> _accessGuard = new();
    private readonly Mock<ICurrentUser> _currentUser = new();

    public AiConfigControllerTests()
    {
        _currentUser.SetupGet(user => user.UserId).Returns(UserId);
    }

    private AiConfigController Build() => new(_service.Object, _accessGuard.Object, _currentUser.Object);

    private void GrantLevel(WorkspaceLevel level) =>
        _accessGuard
            .Setup(guard => guard.HasWorkspaceLevelAsync(UserId, WorkspaceId, level, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

    private static int? StatusOf(IActionResult result) =>
        (result as ObjectResult)?.StatusCode;

    [Fact]
    public async Task Get_NonMember_Returns403()
    {
        // Arrange — no level granted → guard returns false
        var sut = Build();

        // Act
        var result = await sut.Get(WorkspaceId, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, StatusOf(result));
        _service.Verify(service => service.GetAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Get_Member_ReturnsConfig()
    {
        // Arrange
        GrantLevel(WorkspaceLevel.Viewer);
        var dto = new AiConfigDto(true, new[] { "Name", "Description" });
        _service.Setup(service => service.GetAsync(WorkspaceId, It.IsAny<CancellationToken>())).ReturnsAsync(dto);
        var sut = Build();

        // Act
        var result = await sut.Get(WorkspaceId, CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Same(dto, ok.Value);
    }

    [Fact]
    public async Task Update_NonAdmin_Returns403()
    {
        // Arrange — Viewer granted but not WorkspaceAdmin
        GrantLevel(WorkspaceLevel.Viewer);
        var sut = Build();
        var request = new AiConfigUpdateRequest { Enabled = true, ContentFieldAllowlist = new() { "Name" } };

        // Act
        var result = await sut.Update(WorkspaceId, request, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, StatusOf(result));
        _service.Verify(
            service => service.SetAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<bool>(),
                It.IsAny<IReadOnlyList<string>>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Update_EmptyAllowlist_Returns400()
    {
        // Arrange
        GrantLevel(WorkspaceLevel.WorkspaceAdmin);
        var sut = Build();
        var request = new AiConfigUpdateRequest { Enabled = true, ContentFieldAllowlist = new() };

        // Act
        var result = await sut.Update(WorkspaceId, request, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status400BadRequest, StatusOf(result));
        _service.Verify(
            service => service.SetAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<bool>(),
                It.IsAny<IReadOnlyList<string>>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Update_DisallowedField_Returns400()
    {
        // Arrange — a client-matter field can never enter the allowlist
        GrantLevel(WorkspaceLevel.WorkspaceAdmin);
        var sut = Build();
        var request = new AiConfigUpdateRequest { Enabled = true, ContentFieldAllowlist = new() { "Name", "ClientNumber" } };

        // Act
        var result = await sut.Update(WorkspaceId, request, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status400BadRequest, StatusOf(result));
    }

    [Fact]
    public async Task Update_AdminValidAllowlist_Returns200()
    {
        // Arrange
        GrantLevel(WorkspaceLevel.WorkspaceAdmin);
        var request = new AiConfigUpdateRequest { Enabled = true, ContentFieldAllowlist = new() { "Name", "Description" } };
        var dto = new AiConfigDto(true, request.ContentFieldAllowlist);
        _service
            .Setup(service => service.SetAsync(WorkspaceId, UserId, true, It.IsAny<IReadOnlyList<string>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(dto);
        var sut = Build();

        // Act
        var result = await sut.Update(WorkspaceId, request, CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Same(dto, ok.Value);
    }
}

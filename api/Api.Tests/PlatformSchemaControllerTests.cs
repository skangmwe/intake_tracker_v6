// Unit tests for PlatformSchemaController (S34 — Objects / Relationships tab reads). The Platform-
// admin gate, the workspaceId validation, and delegation to the reused services (the services and
// access guard are mocked). Covers each endpoint's happy path, the non-admin 403, the missing-
// workspaceId 400, and cancellation propagation.

using McDermott.AiTracker.Api.Modules.Objects;
using McDermott.AiTracker.Api.Modules.PlatformAdmin;
using McDermott.AiTracker.Api.Modules.Relationships;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class PlatformSchemaControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid WorkspaceId = Guid.NewGuid();

    private static PlatformSchemaController Build(
        bool isPlatformAdmin,
        Mock<IObjectSchemaService>? objects = null,
        Mock<IRelationshipsService>? relationships = null,
        Mock<IPlatformWorkspaceDirectory>? workspaces = null)
    {
        var accessGuard = new Mock<IAccessGuard>();
        accessGuard.Setup(guard => guard.IsPlatformAdminAsync(UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(isPlatformAdmin);

        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        return new PlatformSchemaController(
            (objects ?? new Mock<IObjectSchemaService>()).Object,
            (relationships ?? new Mock<IRelationshipsService>()).Object,
            (workspaces ?? new Mock<IPlatformWorkspaceDirectory>()).Object,
            accessGuard.Object,
            currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
    }

    [Fact]
    public async Task GetObjects_Admin_ReturnsOkWithGlobalObjects()
    {
        // Arrange
        var objects = new Mock<IObjectSchemaService>();
        objects.Setup(service => service.GetGlobalObjects())
            .Returns(ObjectSchemaService.GetGlobalSystemObjects());

        // Act
        var result = await Build(isPlatformAdmin: true, objects: objects).GetObjects(CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        var payload = Assert.IsAssignableFrom<IReadOnlyList<ObjectDefinitionDto>>(ok.Value);
        Assert.Equal(2, payload.Count);
        Assert.All(payload, item => Assert.Equal("Global", item.Location));
    }

    [Fact]
    public async Task GetObjects_NotAdmin_Returns403()
    {
        var objects = new Mock<IObjectSchemaService>();

        var result = await Build(isPlatformAdmin: false, objects: objects).GetObjects(CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        objects.Verify(service => service.GetGlobalObjects(), Times.Never);
    }

    [Fact]
    public async Task GetWorkspaces_Admin_ReturnsOk()
    {
        // Arrange
        var workspaces = new Mock<IPlatformWorkspaceDirectory>();
        workspaces.Setup(directory => directory.ListAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { new PlatformWorkspaceDto(WorkspaceId, "AI Solutions", "ai-solutions") });

        // Act
        var result = await Build(isPlatformAdmin: true, workspaces: workspaces).GetWorkspaces(CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
        workspaces.Verify(directory => directory.ListAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task GetWorkspaces_NotAdmin_Returns403()
    {
        var workspaces = new Mock<IPlatformWorkspaceDirectory>();

        var result = await Build(isPlatformAdmin: false, workspaces: workspaces).GetWorkspaces(CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        workspaces.Verify(directory => directory.ListAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task GetRelationships_Admin_ReturnsOkScopedToWorkspace()
    {
        // Arrange
        var relationships = new Mock<IRelationshipsService>();
        relationships.Setup(service => service.ListAsync(WorkspaceId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<RelationshipDto>());

        // Act
        var result = await Build(isPlatformAdmin: true, relationships: relationships)
            .GetRelationships(WorkspaceId, CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
        relationships.Verify(service => service.ListAsync(WorkspaceId, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task GetRelationships_MissingWorkspaceId_Returns400()
    {
        var relationships = new Mock<IRelationshipsService>();

        var result = await Build(isPlatformAdmin: true, relationships: relationships)
            .GetRelationships(Guid.Empty, CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
        relationships.Verify(
            service => service.ListAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task GetRelationships_NotAdmin_Returns403()
    {
        var relationships = new Mock<IRelationshipsService>();

        var result = await Build(isPlatformAdmin: false, relationships: relationships)
            .GetRelationships(WorkspaceId, CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        relationships.Verify(
            service => service.ListAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task GetRelationships_CancellationPropagates()
    {
        var relationships = new Mock<IRelationshipsService>();
        relationships.Setup(service => service.ListAsync(WorkspaceId, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(isPlatformAdmin: true, relationships: relationships).GetRelationships(WorkspaceId, cts.Token));
    }
}

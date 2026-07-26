// Unit tests for PlatformSchemaController (S34 — Objects / Relationships; Global custom objects,
// SP3b). The Platform-admin gate and delegation to the reused services (the services and access guard
// are mocked). Covers each endpoint's happy path, the non-admin 403, the object-CRUD status mapping
// (200 / 400 / 404 / 409), and cancellation propagation. The Relationships tab is the read-only
// system-seeded reference — no workspace picker, no workspaceId parameter.

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

    private static PlatformSchemaController Build(
        bool isPlatformAdmin,
        Mock<IObjectSchemaService>? objects = null,
        Mock<IRelationshipsService>? relationships = null)
    {
        var accessGuard = new Mock<IAccessGuard>();
        accessGuard.Setup(guard => guard.IsPlatformAdminAsync(UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(isPlatformAdmin);

        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        return new PlatformSchemaController(
            (objects ?? new Mock<IObjectSchemaService>()).Object,
            (relationships ?? new Mock<IRelationshipsService>()).Object,
            accessGuard.Object,
            currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
    }

    private static ObjectDefinitionDto SampleGlobalObject(string name = "Vendor") => new(
        Guid.NewGuid(), Guid.Empty, "vendor", name, "Vendors", "Global", null,
        ShowInSidebar: true, SidebarCategory: null, RecordsCount: 0, FieldsCount: 0, IsSystem: false);

    [Fact]
    public async Task GetObjects_Admin_ReturnsOkWithGlobalObjects()
    {
        // Arrange
        var objects = new Mock<IObjectSchemaService>();
        objects.Setup(service => service.ListGlobalAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(ObjectSchemaService.GetGlobalSystemObjects());

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
        objects.Verify(service => service.ListGlobalAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task CreateObject_Admin_ReturnsOkWithObject()
    {
        // Arrange
        var created = SampleGlobalObject();
        var objects = new Mock<IObjectSchemaService>();
        objects.Setup(service => service.CreateGlobalAsync(
                It.IsAny<ObjectDefinitionCreateRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ObjectMutationResult(ObjectMutationOutcome.Success, created, null));

        // Act — request Location is deliberately LocalWorkspace to assert it is ignored (forced Global).
        var request = new ObjectDefinitionCreateRequest("Vendor", "Vendors", "LocalWorkspace", null, true, null);
        var result = await Build(isPlatformAdmin: true, objects: objects).CreateObject(request, CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Same(created, ok.Value);
    }

    [Fact]
    public async Task CreateObject_NotAdmin_Returns403()
    {
        var objects = new Mock<IObjectSchemaService>();
        var request = new ObjectDefinitionCreateRequest("Vendor", null, "Global", null, true, null);

        var result = await Build(isPlatformAdmin: false, objects: objects).CreateObject(request, CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        objects.Verify(service => service.CreateGlobalAsync(
            It.IsAny<ObjectDefinitionCreateRequest>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task CreateObject_BlankName_Returns400()
    {
        var objects = new Mock<IObjectSchemaService>();
        var request = new ObjectDefinitionCreateRequest("   ", null, "Global", null, true, null);

        var result = await Build(isPlatformAdmin: true, objects: objects).CreateObject(request, CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
        objects.Verify(service => service.CreateGlobalAsync(
            It.IsAny<ObjectDefinitionCreateRequest>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task CreateObject_DuplicateName_Returns409()
    {
        var objects = new Mock<IObjectSchemaService>();
        objects.Setup(service => service.CreateGlobalAsync(
                It.IsAny<ObjectDefinitionCreateRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ObjectMutationResult(
                ObjectMutationOutcome.InvalidState, null, "An object with this name already exists in this workspace."));
        var request = new ObjectDefinitionCreateRequest("Vendor", null, "Global", null, true, null);

        var result = await Build(isPlatformAdmin: true, objects: objects).CreateObject(request, CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, problem.StatusCode);
    }

    [Fact]
    public async Task UpdateObject_NonGlobalId_Returns404()
    {
        var objects = new Mock<IObjectSchemaService>();
        objects.Setup(service => service.UpdateGlobalAsync(
                It.IsAny<Guid>(), It.IsAny<ObjectDefinitionPatchRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ObjectMutationResult(
                ObjectMutationOutcome.NotFound, null, "Global object definition not found."));
        var request = new ObjectDefinitionPatchRequest("Vendor 2", null, null, null, null, null);

        var result = await Build(isPlatformAdmin: true, objects: objects)
            .UpdateObject(Guid.NewGuid(), request, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task UpdateObject_NotAdmin_Returns403()
    {
        var objects = new Mock<IObjectSchemaService>();
        var request = new ObjectDefinitionPatchRequest("Vendor 2", null, null, null, null, null);

        var result = await Build(isPlatformAdmin: false, objects: objects)
            .UpdateObject(Guid.NewGuid(), request, CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        objects.Verify(service => service.UpdateGlobalAsync(
            It.IsAny<Guid>(), It.IsAny<ObjectDefinitionPatchRequest>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task DeleteObject_Admin_Returns204()
    {
        var objects = new Mock<IObjectSchemaService>();
        objects.Setup(service => service.DeleteGlobalAsync(It.IsAny<Guid>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ObjectMutationResult(ObjectMutationOutcome.Success, null, null));

        var result = await Build(isPlatformAdmin: true, objects: objects)
            .DeleteObject(Guid.NewGuid(), CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task DeleteObject_NonGlobalId_Returns404()
    {
        var objects = new Mock<IObjectSchemaService>();
        objects.Setup(service => service.DeleteGlobalAsync(It.IsAny<Guid>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ObjectMutationResult(
                ObjectMutationOutcome.NotFound, null, "Global object definition not found."));

        var result = await Build(isPlatformAdmin: true, objects: objects)
            .DeleteObject(Guid.NewGuid(), CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task DeleteObject_NotAdmin_Returns403()
    {
        var objects = new Mock<IObjectSchemaService>();

        var result = await Build(isPlatformAdmin: false, objects: objects)
            .DeleteObject(Guid.NewGuid(), CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        objects.Verify(service => service.DeleteGlobalAsync(
            It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task GetRelationships_Admin_ReturnsOkWithSystemRelationships()
    {
        // Arrange
        var relationships = new Mock<IRelationshipsService>();
        relationships.Setup(service => service.ListPlatformSystemAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<RelationshipDto>());

        // Act
        var result = await Build(isPlatformAdmin: true, relationships: relationships)
            .GetRelationships(CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
        relationships.Verify(
            service => service.ListPlatformSystemAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task GetRelationships_NotAdmin_Returns403()
    {
        var relationships = new Mock<IRelationshipsService>();

        var result = await Build(isPlatformAdmin: false, relationships: relationships)
            .GetRelationships(CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        relationships.Verify(
            service => service.ListPlatformSystemAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task GetRelationships_CancellationPropagates()
    {
        var relationships = new Mock<IRelationshipsService>();
        relationships.Setup(service => service.ListPlatformSystemAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(isPlatformAdmin: true, relationships: relationships).GetRelationships(cts.Token));
    }
}

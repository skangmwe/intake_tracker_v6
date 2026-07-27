// Unit tests for ObjectsController (Objects tab, S30) — routing, access mapping, validation, and
// status-code mapping only. The service and access guard are mocked. Covers happy path per method,
// access-denied (403, never 404) per verb, validation branches on create/patch, and each outcome
// from ObjectMutationResult.

using McDermott.AiTracker.Api.Modules.Objects;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class ObjectsControllerTests
{
    private static readonly Guid WorkspaceId = new("B0000000-0000-4000-8000-000000000001");
    private static readonly Guid UserId = new("B0000000-0000-4000-8000-000000000002");
    private static readonly Guid ObjectId = new("B0000000-0000-4000-8000-000000000003");

    private static ObjectsController Build(
        Mock<IObjectSchemaService> service,
        bool isViewer = true,
        bool isAdmin = true)
    {
        var accessGuard = new Mock<IAccessGuard>();
        accessGuard.Setup(guard => guard.HasWorkspaceLevelAsync(
            UserId, WorkspaceId, WorkspaceLevel.Viewer, It.IsAny<CancellationToken>())).ReturnsAsync(isViewer);
        accessGuard.Setup(guard => guard.HasWorkspaceLevelAsync(
            UserId, WorkspaceId, WorkspaceLevel.WorkspaceAdmin, It.IsAny<CancellationToken>())).ReturnsAsync(isAdmin);

        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        return new ObjectsController(service.Object, accessGuard.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
    }

    private static ObjectDefinitionDto SampleDto() => new(
        ObjectId, WorkspaceId, "vendor", "Vendor", "Vendors", "LocalWorkspace",
        "A supplier.", ShowInSidebar: true, SidebarCategory: "Reference",
        RecordsCount: 0, FieldsCount: 0, IsSystem: false);

    private static ObjectDefinitionCreateRequest SampleCreate() => new(
        "Vendor", "Vendors", "LocalWorkspace", "A supplier.", ShowInSidebar: true, SidebarCategory: "Reference");

    // ---------- List ----------

    [Fact]
    public async Task List_ViewerCanRead_Returns200()
    {
        // Arrange
        var service = new Mock<IObjectSchemaService>();
        service.Setup(s => s.ListAsync(WorkspaceId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new[] { SampleDto() });

        // Act
        var result = await Build(service).List(WorkspaceId, CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task List_NoMembership_Returns403()
    {
        // Arrange
        var service = new Mock<IObjectSchemaService>();

        // Act — non-member (ownership violation is 403, never 404).
        var result = await Build(service, isViewer: false).List(WorkspaceId, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    // ---------- Create ----------

    [Fact]
    public async Task Create_Valid_Returns201()
    {
        // Arrange
        var service = new Mock<IObjectSchemaService>();
        service.Setup(s => s.CreateAsync(WorkspaceId, It.IsAny<ObjectDefinitionCreateRequest>(),
                UserId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new ObjectMutationResult(ObjectMutationOutcome.Success, SampleDto(), null));

        // Act
        var result = await Build(service).Create(WorkspaceId, SampleCreate(), CancellationToken.None);

        // Assert
        var created = Assert.IsType<CreatedResult>(result);
        Assert.Equal(StatusCodes.Status201Created, created.StatusCode);
    }

    [Theory]
    [InlineData("", "LocalWorkspace", "name")]
    [InlineData("   ", "Global", "name")]
    [InlineData("Vendor", "Bogus", "location")]
    public async Task Create_Invalid_Returns400(string name, string location, string expectedField)
    {
        // Arrange
        var service = new Mock<IObjectSchemaService>();
        var request = new ObjectDefinitionCreateRequest(name, null, location, null, false, null);

        // Act
        var result = await Build(service).Create(WorkspaceId, request, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<BadRequestObjectResult>(result);
        var details = Assert.IsType<ValidationProblemDetails>(problem.Value);
        Assert.Contains(expectedField, details.Errors.Keys);
    }

    [Fact]
    public async Task Create_GlobalLocation_Returns400()
    {
        // Arrange — workspaces can only author LocalWorkspace objects; Global is platform-only
        // (via PlatformSchemaController), never reachable through this workspace-scoped endpoint.
        var service = new Mock<IObjectSchemaService>();
        var request = new ObjectDefinitionCreateRequest("Vendor", "Vendors", "Global", null, false, null);

        // Act
        var result = await Build(service).Create(WorkspaceId, request, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<BadRequestObjectResult>(result);
        var details = Assert.IsType<ValidationProblemDetails>(problem.Value);
        Assert.Contains("location", details.Errors.Keys);
    }

    [Fact]
    public async Task Create_DuplicateName_Returns409()
    {
        // Arrange — the service maps proc 50081 to InvalidState.
        var service = new Mock<IObjectSchemaService>();
        service.Setup(s => s.CreateAsync(WorkspaceId, It.IsAny<ObjectDefinitionCreateRequest>(),
                UserId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new ObjectMutationResult(
                   ObjectMutationOutcome.InvalidState, null, "An object with this name already exists in this workspace."));

        // Act
        var result = await Build(service).Create(WorkspaceId, SampleCreate(), CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, problem.StatusCode);
    }

    [Fact]
    public async Task Create_NonAdmin_Returns403()
    {
        // Arrange
        var service = new Mock<IObjectSchemaService>();

        // Act
        var result = await Build(service, isAdmin: false).Create(WorkspaceId, SampleCreate(), CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    // ---------- Update ----------

    [Fact]
    public async Task Update_Success_Returns200()
    {
        // Arrange
        var service = new Mock<IObjectSchemaService>();
        service.Setup(s => s.UpdateAsync(ObjectId, WorkspaceId, It.IsAny<ObjectDefinitionPatchRequest>(),
                UserId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new ObjectMutationResult(ObjectMutationOutcome.Success, SampleDto(), null));

        // Act
        var result = await Build(service).Update(ObjectId, WorkspaceId,
            new ObjectDefinitionPatchRequest("Renamed", null, null, null, null, null), CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task Update_BadLocation_Returns400()
    {
        // Arrange
        var service = new Mock<IObjectSchemaService>();

        // Act — an explicit invalid location on the patch.
        var result = await Build(service).Update(ObjectId, WorkspaceId,
            new ObjectDefinitionPatchRequest(null, null, "Bogus", null, null, null), CancellationToken.None);

        // Assert
        var problem = Assert.IsType<BadRequestObjectResult>(result);
        var details = Assert.IsType<ValidationProblemDetails>(problem.Value);
        Assert.Contains("location", details.Errors.Keys);
    }

    [Fact]
    public async Task Update_GlobalLocation_Returns400()
    {
        // Arrange — a workspace patch may not set Location='Global' either; only platform admins
        // (via PlatformSchemaController) can create/own Global objects.
        var service = new Mock<IObjectSchemaService>();

        // Act
        var result = await Build(service).Update(ObjectId, WorkspaceId,
            new ObjectDefinitionPatchRequest(null, null, "Global", null, null, null), CancellationToken.None);

        // Assert
        var problem = Assert.IsType<BadRequestObjectResult>(result);
        var details = Assert.IsType<ValidationProblemDetails>(problem.Value);
        Assert.Contains("location", details.Errors.Keys);
    }

    [Fact]
    public async Task Update_NotFound_Returns404()
    {
        // Arrange — a missing (or built-in) id resolves to NotFound.
        var service = new Mock<IObjectSchemaService>();
        service.Setup(s => s.UpdateAsync(ObjectId, WorkspaceId, It.IsAny<ObjectDefinitionPatchRequest>(),
                UserId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new ObjectMutationResult(ObjectMutationOutcome.NotFound, null, null));

        // Act
        var result = await Build(service).Update(ObjectId, WorkspaceId,
            new ObjectDefinitionPatchRequest("Renamed", null, null, null, null, null), CancellationToken.None);

        // Assert
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Update_NonAdmin_Returns403()
    {
        // Arrange
        var service = new Mock<IObjectSchemaService>();

        // Act
        var result = await Build(service, isAdmin: false).Update(ObjectId, WorkspaceId,
            new ObjectDefinitionPatchRequest("Renamed", null, null, null, null, null), CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    // ---------- Delete ----------

    [Fact]
    public async Task Delete_Success_Returns204()
    {
        // Arrange
        var service = new Mock<IObjectSchemaService>();
        service.Setup(s => s.DeleteAsync(ObjectId, WorkspaceId, UserId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new ObjectMutationResult(ObjectMutationOutcome.Success, null, null));

        // Act
        var result = await Build(service).Delete(ObjectId, WorkspaceId, CancellationToken.None);

        // Assert
        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task Delete_NotFound_Returns404()
    {
        // Arrange — a missing (or built-in) id.
        var service = new Mock<IObjectSchemaService>();
        service.Setup(s => s.DeleteAsync(ObjectId, WorkspaceId, UserId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new ObjectMutationResult(ObjectMutationOutcome.NotFound, null, "Object definition not found."));

        // Act
        var result = await Build(service).Delete(ObjectId, WorkspaceId, CancellationToken.None);

        // Assert
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Delete_NonAdmin_Returns403()
    {
        // Arrange
        var service = new Mock<IObjectSchemaService>();

        // Act
        var result = await Build(service, isAdmin: false).Delete(ObjectId, WorkspaceId, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }
}

// Unit tests for FieldsController.GetFields object-type resolution (Slice A / Task A5) — a custom
// object slug that resolves to a real ObjectDefinition returns its schema; an unknown slug is 404
// (never disclosing existence); the built-in types are unchanged. Service and access guard are
// mocked (api-testing-guidelines.md).

using McDermott.AiTracker.Api.Modules.Fields;
using McDermott.AiTracker.Api.Modules.Objects;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class FieldsControllerObjectTypeTests
{
    private static readonly Guid WorkspaceId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    private static FieldsController Build(
        Mock<IFieldSchemaService> fields,
        IReadOnlyList<ObjectDefinitionDto>? objects = null)
    {
        var accessGuard = new Mock<IAccessGuard>();
        accessGuard.Setup(guard => guard.HasWorkspaceLevelAsync(UserId, WorkspaceId, WorkspaceLevel.Viewer, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        var objectsMock = new Mock<IObjectSchemaService>();
        objectsMock.Setup(service => service.ListAsync(WorkspaceId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(objects ?? Array.Empty<ObjectDefinitionDto>());

        var httpContext = new DefaultHttpContext();
        httpContext.Items[OperationIdMiddleware.HeaderName] = "op-123";

        return new FieldsController(fields.Object, objectsMock.Object, accessGuard.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };
    }

    private static ObjectDefinitionDto CustomObject(string slug) => new(
        Guid.NewGuid(), WorkspaceId, slug, "Vendor", "Vendors", "LocalWorkspace", null,
        ShowInSidebar: true, SidebarCategory: null, RecordsCount: 0, FieldsCount: 0, IsSystem: false);

    [Fact]
    public async Task GetFields_CustomSlug_Returns200WithSchema()
    {
        // Arrange — the slug resolves to a real custom object, so its schema is returned.
        var schema = new WorkspaceFieldSchemaDto(WorkspaceId, "vendor", Array.Empty<FieldDefinitionDto>(), Array.Empty<PlatformFieldDto>());
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.GetSchemaAsync(WorkspaceId, "vendor", It.IsAny<CancellationToken>())).ReturnsAsync(schema);
        var sut = Build(fields, new[] { CustomObject("vendor") });

        // Act
        var result = await sut.GetFields(WorkspaceId, "vendor", CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Same(schema, ok.Value);
    }

    [Fact]
    public async Task GetFields_UnknownSlug_Returns404()
    {
        // Arrange — no custom object matches the slug; never disclose (404, not 400).
        var fields = new Mock<IFieldSchemaService>();
        var sut = Build(fields, new[] { CustomObject("vendor") });

        // Act
        var result = await sut.GetFields(WorkspaceId, "ghost", CancellationToken.None);

        // Assert
        Assert.IsType<NotFoundResult>(result);
        fields.Verify(
            service => service.GetSchemaAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task GetFields_BuiltinType_Unchanged()
    {
        // Arrange — a built-in type never touches the object resolver.
        var schema = new WorkspaceFieldSchemaDto(WorkspaceId, "Request", Array.Empty<FieldDefinitionDto>(), Array.Empty<PlatformFieldDto>());
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.GetSchemaAsync(WorkspaceId, "Request", It.IsAny<CancellationToken>())).ReturnsAsync(schema);
        var sut = Build(fields);

        // Act
        var result = await sut.GetFields(WorkspaceId, "Request", CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Same(schema, ok.Value);
    }

    private static FieldsController BuildAdmin(
        Mock<IFieldSchemaService> fields,
        IReadOnlyList<ObjectDefinitionDto>? objects = null)
    {
        var accessGuard = new Mock<IAccessGuard>();
        accessGuard.Setup(guard => guard.HasWorkspaceLevelAsync(UserId, WorkspaceId, It.IsAny<WorkspaceLevel>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        var objectsMock = new Mock<IObjectSchemaService>();
        objectsMock.Setup(service => service.ListAsync(WorkspaceId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(objects ?? Array.Empty<ObjectDefinitionDto>());

        var httpContext = new DefaultHttpContext();
        httpContext.Items[OperationIdMiddleware.HeaderName] = "op-123";
        return new FieldsController(fields.Object, objectsMock.Object, accessGuard.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };
    }

    private static FieldDefinitionUpsertRequest UpsertReq(string objectType, string location = "LocalWorkspace") => new()
    {
        ObjectType = objectType, Location = location, FieldKey = "Owner",
        DisplayName = "Owner", FieldType = "ShortText", Category = "WorkspaceLocal",
    };

    [Fact]
    public async Task CreateField_UnknownSlug_Returns404()
    {
        var fields = new Mock<IFieldSchemaService>();
        var sut = BuildAdmin(fields, new[] { CustomObject("vendor") });

        var result = await sut.CreateField(WorkspaceId, UpsertReq("ghost"), CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
        fields.Verify(s => s.UpsertFieldAsync(It.IsAny<Guid>(), It.IsAny<FieldDefinitionUpsertRequest>(),
            It.IsAny<bool>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task CreateField_CustomObjectWithGlobalLocation_Returns400()
    {
        var fields = new Mock<IFieldSchemaService>();
        var sut = BuildAdmin(fields, new[] { CustomObject("vendor") });

        var result = await sut.CreateField(WorkspaceId, UpsertReq("vendor", location: "Global"), CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
        fields.Verify(s => s.UpsertFieldAsync(It.IsAny<Guid>(), It.IsAny<FieldDefinitionUpsertRequest>(),
            It.IsAny<bool>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task RetireField_UnknownSlug_Returns404()
    {
        var fields = new Mock<IFieldSchemaService>();
        var sut = BuildAdmin(fields, new[] { CustomObject("vendor") });

        var result = await sut.RetireField(WorkspaceId, "Owner", "ghost", CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task CreateField_ValidCustomSlug_ProceedsToUpsert()
    {
        // Arrange — the slug resolves, so the guard passes and the service is invoked. We assert the
        // call happened (a ValidationFailed result avoids constructing a full FieldDefinitionDto).
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(s => s.UpsertFieldAsync(WorkspaceId, It.IsAny<FieldDefinitionUpsertRequest>(),
                true, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FieldOperationResult(FieldOperationOutcome.ValidationFailed, Errors: new[] { "x" }));
        var sut = BuildAdmin(fields, new[] { CustomObject("vendor") });

        // Act
        await sut.CreateField(WorkspaceId, UpsertReq("vendor"), CancellationToken.None);

        // Assert — the guard let the request through to the service (slug resolved).
        fields.Verify(s => s.UpsertFieldAsync(WorkspaceId, It.IsAny<FieldDefinitionUpsertRequest>(),
            true, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Once);
    }
}

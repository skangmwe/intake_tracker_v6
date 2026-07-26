// Unit tests for PlatformSchemaController (S34 — Objects / Relationships; Global custom objects,
// SP3b). The Platform-admin gate and delegation to the reused services (the services and access guard
// are mocked). Covers each endpoint's happy path, the non-admin 403, the object-CRUD status mapping
// (200 / 400 / 404 / 409), and cancellation propagation. The Relationships tab is the read-only
// system-seeded reference — no workspace picker, no workspaceId parameter. The field CRUD endpoints
// (SP3b Slice 2a, Task 4) delegate to IFieldSchemaService's Global-object methods (Task 3) and are
// covered the same way: mocked service, asserting the controller's status-code mapping only.

using McDermott.AiTracker.Api.Modules.Fields;
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
        Mock<IRelationshipsService>? relationships = null,
        Mock<IFieldSchemaService>? fields = null)
    {
        var accessGuard = new Mock<IAccessGuard>();
        accessGuard.Setup(guard => guard.IsPlatformAdminAsync(UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(isPlatformAdmin);

        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        return new PlatformSchemaController(
            (objects ?? new Mock<IObjectSchemaService>()).Object,
            (fields ?? new Mock<IFieldSchemaService>()).Object,
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
    public async Task UpdateObject_BlankName_Returns400()
    {
        var objects = new Mock<IObjectSchemaService>();
        var request = new ObjectDefinitionPatchRequest("   ", null, null, null, null, null);

        var result = await Build(isPlatformAdmin: true, objects: objects)
            .UpdateObject(Guid.NewGuid(), request, CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
        objects.Verify(service => service.UpdateGlobalAsync(
            It.IsAny<Guid>(), It.IsAny<ObjectDefinitionPatchRequest>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()),
            Times.Never);
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

    // ─── Field CRUD on a Global custom object (SP3b Slice 2a, Task 4) ──────────────────────────

    private static FieldDefinitionDto SampleGlobalField(string fieldKey = "priority") => new(
        Guid.NewGuid(), Guid.Empty, "vendor", fieldKey, "Priority", "ShortText", "WorkspaceLocal",
        Section: null, HelpText: null, IsRequired: false, IsReadOnly: false, IsPlatformDefined: false,
        IsSystemProvisioned: false, Location: "Global", IsLocal: true,
        PlatformFieldKey: null, VisibleStages: null, CrossingToFieldKey: null, MinValue: null, MaxValue: null,
        AllowNewValues: false, SortOrder: 1, IsRetired: false,
        Options: Array.Empty<SelectOptionDto>(), Rules: Array.Empty<FieldRuleDto>(), Derived: null,
        CreatedAt: DateTime.UtcNow, UpdatedAt: DateTime.UtcNow);

    private static FieldDefinitionUpsertRequest SampleFieldRequest(string fieldKey = "priority") => new()
    {
        ObjectType = "vendor",
        FieldKey = fieldKey,
        DisplayName = "Priority",
        FieldType = "ShortText",
        Category = "WorkspaceLocal",
    };

    [Fact]
    public async Task CreateField_NotAdmin_Returns403()
    {
        var fields = new Mock<IFieldSchemaService>();

        var result = await Build(isPlatformAdmin: false, fields: fields)
            .CreateField("vendor", SampleFieldRequest(), CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        fields.Verify(service => service.UpsertGlobalObjectFieldAsync(
            It.IsAny<string>(), It.IsAny<FieldDefinitionUpsertRequest>(), It.IsAny<bool>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task UpdateField_NotAdmin_Returns403()
    {
        var fields = new Mock<IFieldSchemaService>();

        var result = await Build(isPlatformAdmin: false, fields: fields)
            .UpdateField("vendor", "priority", SampleFieldRequest(), CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        fields.Verify(service => service.UpsertGlobalObjectFieldAsync(
            It.IsAny<string>(), It.IsAny<FieldDefinitionUpsertRequest>(), It.IsAny<bool>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task DeleteField_NotAdmin_Returns403()
    {
        var fields = new Mock<IFieldSchemaService>();

        var result = await Build(isPlatformAdmin: false, fields: fields)
            .DeleteField("vendor", "priority", CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        fields.Verify(service => service.RetireGlobalObjectFieldAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task CreateField_Admin_ReturnsOkWithField()
    {
        var created = SampleGlobalField();
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.UpsertGlobalObjectFieldAsync(
                "vendor", It.IsAny<FieldDefinitionUpsertRequest>(), true, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FieldOperationResult(FieldOperationOutcome.Success, created));

        var result = await Build(isPlatformAdmin: true, fields: fields)
            .CreateField("vendor", SampleFieldRequest(), CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Same(created, ok.Value);
    }

    [Fact]
    public async Task CreateField_BadShape_Returns400()
    {
        // A Select field with no options is a shape the service rejects — the controller only needs
        // to map ValidationFailed to 400 (the shape validation itself lives in FieldSchemaService).
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.UpsertGlobalObjectFieldAsync(
                "vendor", It.IsAny<FieldDefinitionUpsertRequest>(), true, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FieldOperationResult(
                FieldOperationOutcome.ValidationFailed,
                Errors: new[] { "A Select field requires at least one option." }));
        var request = SampleFieldRequest();
        request.FieldType = "SingleSelect";
        request.Options = null;

        var result = await Build(isPlatformAdmin: true, fields: fields)
            .CreateField("vendor", request, CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
    }

    [Fact]
    public async Task CreateField_DuplicateKey_Returns409()
    {
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.UpsertGlobalObjectFieldAsync(
                "vendor", It.IsAny<FieldDefinitionUpsertRequest>(), true, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FieldOperationResult(FieldOperationOutcome.Conflict));

        var result = await Build(isPlatformAdmin: true, fields: fields)
            .CreateField("vendor", SampleFieldRequest(), CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, problem.StatusCode);
    }

    [Fact]
    public async Task UpdateField_Admin_ReturnsOkAndSetsFieldKeyFromRoute()
    {
        var updated = SampleGlobalField("priority");
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.UpsertGlobalObjectFieldAsync(
                "vendor", It.Is<FieldDefinitionUpsertRequest>(r => r.FieldKey == "priority"), false, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FieldOperationResult(FieldOperationOutcome.Success, updated));

        // The request body carries a different key; the route's fieldKey must win.
        var result = await Build(isPlatformAdmin: true, fields: fields)
            .UpdateField("vendor", "priority", SampleFieldRequest("someOtherKey"), CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Same(updated, ok.Value);
    }

    [Fact]
    public async Task UpdateField_NonGlobalObject_Returns404()
    {
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.UpsertGlobalObjectFieldAsync(
                "ghost", It.IsAny<FieldDefinitionUpsertRequest>(), false, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FieldOperationResult(FieldOperationOutcome.NotFound));

        var result = await Build(isPlatformAdmin: true, fields: fields)
            .UpdateField("ghost", "priority", SampleFieldRequest(), CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task DeleteField_NonGlobalObject_Returns404()
    {
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.RetireGlobalObjectFieldAsync("ghost", "priority", UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FieldOperationResult(FieldOperationOutcome.NotFound));

        var result = await Build(isPlatformAdmin: true, fields: fields)
            .DeleteField("ghost", "priority", CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task DeleteField_Admin_Returns204()
    {
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.RetireGlobalObjectFieldAsync("vendor", "priority", UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FieldOperationResult(FieldOperationOutcome.Success, SampleGlobalField() with { IsRetired = true }));

        var result = await Build(isPlatformAdmin: true, fields: fields)
            .DeleteField("vendor", "priority", CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task DeleteField_StillReferenced_Returns400()
    {
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.RetireGlobalObjectFieldAsync("vendor", "priority", UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FieldOperationResult(
                FieldOperationOutcome.ValidationFailed, Errors: new[] { "referenced" }));

        var result = await Build(isPlatformAdmin: true, fields: fields)
            .DeleteField("vendor", "priority", CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
    }

    [Fact]
    public async Task CreateField_CancellationPropagates()
    {
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.UpsertGlobalObjectFieldAsync(
                "vendor", It.IsAny<FieldDefinitionUpsertRequest>(), true, UserId, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(isPlatformAdmin: true, fields: fields).CreateField("vendor", SampleFieldRequest(), cts.Token));
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

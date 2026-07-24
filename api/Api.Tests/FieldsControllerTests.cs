// Unit tests for FieldsController — routing, access mapping, and status-code mapping only
// (the service and access guard are mocked). Covers happy path, each service outcome, the
// access-denied (403 never 404) branch, and cancellation-token propagation
// (api-testing-guidelines.md).

using McDermott.AiTracker.Api.Modules.Fields;
using McDermott.AiTracker.Api.Modules.Objects;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class FieldsControllerTests
{
    private static readonly Guid WorkspaceId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    private static FieldsController Build(
        Mock<IFieldSchemaService> fields,
        bool isViewer = true,
        bool isAdmin = true,
        Mock<IObjectSchemaService>? objects = null)
    {
        var accessGuard = new Mock<IAccessGuard>();
        accessGuard.Setup(guard => guard.HasWorkspaceLevelAsync(UserId, WorkspaceId, WorkspaceLevel.Viewer, It.IsAny<CancellationToken>())).ReturnsAsync(isViewer);
        accessGuard.Setup(guard => guard.HasWorkspaceLevelAsync(UserId, WorkspaceId, WorkspaceLevel.WorkspaceAdmin, It.IsAny<CancellationToken>())).ReturnsAsync(isAdmin);

        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        // Default: no custom objects in the workspace (so an unknown slug resolves to 404). Tests that
        // exercise the custom-slug path pass their own configured mock.
        var objectsMock = objects ?? new Mock<IObjectSchemaService>();
        if (objects is null)
        {
            objectsMock.Setup(service => service.ListAsync(WorkspaceId, It.IsAny<CancellationToken>()))
                .ReturnsAsync(Array.Empty<ObjectDefinitionDto>());
        }

        var httpContext = new DefaultHttpContext();
        httpContext.Items[OperationIdMiddleware.HeaderName] = "op-123";

        return new FieldsController(fields.Object, objectsMock.Object, accessGuard.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };
    }

    private static FieldDefinitionDto SampleField(string key = "severity") => new(
        Guid.NewGuid(), WorkspaceId, "Request", key, "Severity", "SingleSelect", "WorkspaceLocal",
        Section: null, HelpText: null, IsRequired: false, IsReadOnly: false, IsPlatformDefined: false,
        IsSystemProvisioned: false, Location: "LocalWorkspace", IsLocal: true,
        PlatformFieldKey: null, VisibleStages: null, CrossingToFieldKey: null, MinValue: null, MaxValue: null,
        AllowNewValues: false, SortOrder: 1, IsRetired: false,
        Options: Array.Empty<SelectOptionDto>(), Rules: Array.Empty<FieldRuleDto>(), Derived: null,
        CreatedAt: DateTime.UtcNow, UpdatedAt: DateTime.UtcNow);

    private static FieldDefinitionUpsertRequest SampleRequest() => new()
    {
        ObjectType = "Request",
        FieldKey = "severity",
        DisplayName = "Severity",
        FieldType = "SingleSelect",
        Category = "WorkspaceLocal",
    };

    [Fact]
    public async Task GetFields_MemberCanRead_ReturnsOk()
    {
        // Arrange
        var schema = new WorkspaceFieldSchemaDto(WorkspaceId, "Request", Array.Empty<FieldDefinitionDto>(), Array.Empty<PlatformFieldDto>());
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.GetSchemaAsync(WorkspaceId, "Request", It.IsAny<CancellationToken>())).ReturnsAsync(schema);

        // Act
        var result = await Build(fields).GetFields(WorkspaceId, "Request", CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Same(schema, ok.Value);
    }

    [Fact]
    public async Task GetFields_NoMembership_Returns403NotFound()
    {
        // Arrange
        var fields = new Mock<IFieldSchemaService>();

        // Act
        var result = await Build(fields, isViewer: false).GetFields(WorkspaceId, "Request", CancellationToken.None);

        // Assert — ownership violation is 403, never 404 (api-error-handling.md).
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task GetFields_UnknownSlug_Returns404()
    {
        // A value that is neither a built-in type nor a resolvable custom object slug is 404 (never
        // disclosing whether the slug exists), not 400 — the custom-object records surface (A5).
        var fields = new Mock<IFieldSchemaService>();
        var result = await Build(fields).GetFields(WorkspaceId, "unknown-object", CancellationToken.None);
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task GetFields_AttachmentObjectType_IsAccepted()
    {
        // Arrange — the widened object set (migration 073) accepts Attachment.
        var schema = new WorkspaceFieldSchemaDto(WorkspaceId, "Attachment", Array.Empty<FieldDefinitionDto>(), Array.Empty<PlatformFieldDto>());
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.GetSchemaAsync(WorkspaceId, "Attachment", It.IsAny<CancellationToken>())).ReturnsAsync(schema);

        // Act
        var result = await Build(fields).GetFields(WorkspaceId, "Attachment", CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task GetFieldCatalog_MemberCanRead_ReturnsOk()
    {
        // Arrange
        var catalog = new WorkspaceFieldCatalogDto(WorkspaceId, Array.Empty<FieldCatalogRowDto>());
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.GetCatalogAsync(WorkspaceId, It.IsAny<CancellationToken>())).ReturnsAsync(catalog);

        // Act
        var result = await Build(fields).GetFieldCatalog(WorkspaceId, CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Same(catalog, ok.Value);
    }

    [Fact]
    public async Task GetFieldCatalog_NoMembership_Returns403()
    {
        var fields = new Mock<IFieldSchemaService>();
        var result = await Build(fields, isViewer: false).GetFieldCatalog(WorkspaceId, CancellationToken.None);
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task UpdateField_ForeignGlobal_Returns403()
    {
        // Arrange — a Global field owned by another workspace is read-only here.
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.UpsertFieldAsync(WorkspaceId, It.IsAny<FieldDefinitionUpsertRequest>(), false, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FieldOperationResult(FieldOperationOutcome.ForeignGlobal));

        // Act
        var result = await Build(fields).UpdateField(WorkspaceId, "sharedPriority", SampleRequest(), CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task CreateField_Success_Returns201()
    {
        // Arrange
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.UpsertFieldAsync(WorkspaceId, It.IsAny<FieldDefinitionUpsertRequest>(), true, UserId, "op-123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FieldOperationResult(FieldOperationOutcome.Success, SampleField()));

        // Act
        var result = await Build(fields).CreateField(WorkspaceId, SampleRequest(), CancellationToken.None);

        // Assert
        Assert.IsType<CreatedResult>(result);
    }

    [Fact]
    public async Task CreateField_DuplicateKey_Returns409()
    {
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.UpsertFieldAsync(WorkspaceId, It.IsAny<FieldDefinitionUpsertRequest>(), true, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FieldOperationResult(FieldOperationOutcome.Conflict));

        var result = await Build(fields).CreateField(WorkspaceId, SampleRequest(), CancellationToken.None);

        var conflict = Assert.IsType<ConflictObjectResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, conflict.StatusCode);
    }

    [Fact]
    public async Task CreateField_NotAdmin_Returns403()
    {
        var fields = new Mock<IFieldSchemaService>();
        var result = await Build(fields, isAdmin: false).CreateField(WorkspaceId, SampleRequest(), CancellationToken.None);
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task CreateField_ValidationFailed_Returns400()
    {
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.UpsertFieldAsync(WorkspaceId, It.IsAny<FieldDefinitionUpsertRequest>(), true, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FieldOperationResult(FieldOperationOutcome.ValidationFailed, Errors: new[] { "cycle" }));

        var result = await Build(fields).CreateField(WorkspaceId, SampleRequest(), CancellationToken.None);
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
    }

    [Fact]
    public async Task UpdateField_NotFound_Returns404()
    {
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.UpsertFieldAsync(WorkspaceId, It.IsAny<FieldDefinitionUpsertRequest>(), false, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FieldOperationResult(FieldOperationOutcome.NotFound));

        var result = await Build(fields).UpdateField(WorkspaceId, "ghost", SampleRequest(), CancellationToken.None);
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task UpdateField_PlatformDefined_Returns403()
    {
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.UpsertFieldAsync(WorkspaceId, It.IsAny<FieldDefinitionUpsertRequest>(), false, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FieldOperationResult(FieldOperationOutcome.PlatformDefined));

        var result = await Build(fields).UpdateField(WorkspaceId, "legacyId", SampleRequest(), CancellationToken.None);
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task RetireField_Success_Returns204()
    {
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.RetireFieldAsync(WorkspaceId, "Request", "triageNotes", UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FieldOperationResult(FieldOperationOutcome.Success, SampleField("triageNotes")));

        var result = await Build(fields).RetireField(WorkspaceId, "triageNotes", "Request", CancellationToken.None);
        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task RetireField_StillReferenced_Returns400()
    {
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.RetireFieldAsync(WorkspaceId, "Request", "businessValue", UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FieldOperationResult(FieldOperationOutcome.ValidationFailed, Errors: new[] { "referenced" }));

        var result = await Build(fields).RetireField(WorkspaceId, "businessValue", "Request", CancellationToken.None);
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
    }

    [Fact]
    public async Task GetTaskFields_ReturnsOk()
    {
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.GetTaskLibraryAsync(WorkspaceId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<TaskLibraryFieldDto>());

        var result = await Build(fields).GetTaskFields(WorkspaceId, CancellationToken.None);
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task CreateField_CancellationPropagates()
    {
        // Arrange — a cancelled token surfaces as an OperationCanceledException, not a swallowed result.
        var fields = new Mock<IFieldSchemaService>();
        fields.Setup(service => service.UpsertFieldAsync(WorkspaceId, It.IsAny<FieldDefinitionUpsertRequest>(), true, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(fields).CreateField(WorkspaceId, SampleRequest(), cts.Token));
    }
}

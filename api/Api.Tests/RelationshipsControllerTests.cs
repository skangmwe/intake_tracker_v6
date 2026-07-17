// Unit tests for RelationshipsController (Slice 25) — routing, access mapping, validation,
// and status-code mapping only. The service and access guard are mocked. Covers happy path
// per method, access-denied (403, never 404) per verb, validation branches on create, and
// each outcome from RelationshipMutationResult / RelationshipRetireResponse.

using McDermott.AiTracker.Api.Modules.Relationships;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class RelationshipsControllerTests
{
    private static readonly Guid WorkspaceId = new("A0000000-0000-4000-8000-000000000001");
    private static readonly Guid UserId = new("A0000000-0000-4000-8000-000000000002");
    private static readonly Guid RelationshipId = new("A0000000-0000-4000-8000-000000000003");

    private static RelationshipsController Build(
        Mock<IRelationshipsService> service,
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

        var httpContext = new DefaultHttpContext();
        httpContext.Items[OperationIdMiddleware.HeaderName] = "op-1";

        return new RelationshipsController(service.Object, accessGuard.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };
    }

    private static RelationshipDto SampleDto(bool isSystem = false) => new(
        RelationshipId, WorkspaceId, "Request has Tasks",
        "Request", "Task", "OneToMany", "Tasks", "Request",
        ShowOnFromAsTab: true, TabLabel: "Tasks", SortOrder: 0,
        IsRetired: false, IsSystem: isSystem,
        CreatedAt: DateTime.UtcNow, UpdatedAt: DateTime.UtcNow,
        CreatedBy: "seed", UpdatedBy: "seed");

    private static RelationshipCreateRequest SampleCreate() => new(
        "Request has Tasks", "Request", "Task", "OneToMany",
        "Tasks", "Request", ShowOnFromAsTab: false, TabLabel: null, SortOrder: 0);

    // ---------- List ----------

    [Fact]
    public async Task List_ViewerCanRead_Returns200()
    {
        // Arrange
        var service = new Mock<IRelationshipsService>();
        service.Setup(s => s.ListAsync(WorkspaceId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new[] { SampleDto() });

        // Act
        var result = await Build(service).List(WorkspaceId, CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.NotNull(ok.Value);
    }

    [Fact]
    public async Task List_NoMembership_Returns403()
    {
        // Arrange
        var service = new Mock<IRelationshipsService>();

        // Act — non-member (ownership violation is 403, never 404 per api-error-handling.md).
        var result = await Build(service, isViewer: false).List(WorkspaceId, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    // ---------- GetById ----------

    [Fact]
    public async Task GetById_Found_Returns200()
    {
        // Arrange
        var service = new Mock<IRelationshipsService>();
        service.Setup(s => s.GetByIdAsync(RelationshipId, WorkspaceId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(SampleDto());

        // Act
        var result = await Build(service).GetById(RelationshipId, WorkspaceId, CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task GetById_Missing_Returns404()
    {
        // Arrange — member sees a real 404 (the row is genuinely absent for a Viewer+ query).
        var service = new Mock<IRelationshipsService>();
        service.Setup(s => s.GetByIdAsync(RelationshipId, WorkspaceId, It.IsAny<CancellationToken>()))
               .ReturnsAsync((RelationshipDto?)null);

        // Act
        var result = await Build(service).GetById(RelationshipId, WorkspaceId, CancellationToken.None);

        // Assert
        Assert.IsType<NotFoundResult>(result);
    }

    // ---------- Create ----------

    [Fact]
    public async Task Create_Valid_Returns201()
    {
        // Arrange
        var service = new Mock<IRelationshipsService>();
        service.Setup(s => s.CreateAsync(WorkspaceId, It.IsAny<RelationshipCreateRequest>(),
                UserId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new RelationshipMutationResult(
                   RelationshipMutationOutcome.Success, SampleDto(), null, null));

        // Act
        var result = await Build(service).Create(WorkspaceId, SampleCreate(), CancellationToken.None);

        // Assert
        var created = Assert.IsType<CreatedResult>(result);
        Assert.Equal(StatusCodes.Status201Created, created.StatusCode);
    }

    [Theory]
    [InlineData("", "Request", "Task", "OneToMany", "Tasks", "Request", "name")]
    [InlineData("Rel", "", "Task", "OneToMany", "Tasks", "Request", "fromObjectType")]
    [InlineData("Rel", "Request", "", "OneToMany", "Tasks", "Request", "toObjectType")]
    [InlineData("Rel", "Request", "Task", "Bogus", "Tasks", "Request", "cardinality")]
    [InlineData("Rel", "Request", "Task", "OneToMany", "", "Request", "fromSideLabel")]
    [InlineData("Rel", "Request", "Task", "OneToMany", "Tasks", "", "toSideLabel")]
    public async Task Create_Invalid_Returns400(
        string name, string from, string to, string card, string fromLabel, string toLabel, string expectedField)
    {
        // Arrange
        var service = new Mock<IRelationshipsService>();
        var request = new RelationshipCreateRequest(
            name, from, to, card, fromLabel, toLabel, false, null, 0);

        // Act
        var result = await Build(service).Create(WorkspaceId, request, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<BadRequestObjectResult>(result);
        var details = Assert.IsType<ValidationProblemDetails>(problem.Value);
        Assert.Contains(expectedField, details.Errors.Keys);
    }

    [Fact]
    public async Task Create_ShowAsTabWithoutTabLabel_Returns400()
    {
        // Arrange — ShowOnFromAsTab requires a TabLabel.
        var service = new Mock<IRelationshipsService>();
        var request = new RelationshipCreateRequest(
            "Rel", "Request", "Task", "OneToMany", "Tasks", "Request",
            ShowOnFromAsTab: true, TabLabel: "  ", SortOrder: 0);

        // Act
        var result = await Build(service).Create(WorkspaceId, request, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<BadRequestObjectResult>(result);
        var details = Assert.IsType<ValidationProblemDetails>(problem.Value);
        Assert.Contains("tabLabel", details.Errors.Keys);
    }

    [Fact]
    public async Task Create_NonAdmin_Returns403()
    {
        // Arrange
        var service = new Mock<IRelationshipsService>();

        // Act
        var result = await Build(service, isAdmin: false).Create(
            WorkspaceId, SampleCreate(), CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    // ---------- Update ----------

    [Fact]
    public async Task Update_Success_Returns200()
    {
        // Arrange
        var service = new Mock<IRelationshipsService>();
        service.Setup(s => s.UpdateAsync(RelationshipId, WorkspaceId, It.IsAny<RelationshipPatchRequest>(),
                UserId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new RelationshipMutationResult(
                   RelationshipMutationOutcome.Success, SampleDto(), null, null));

        // Act
        var result = await Build(service).Update(RelationshipId, WorkspaceId,
            new RelationshipPatchRequest("Renamed", null, null, null, null, null),
            CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task Update_SystemBlock_Returns409()
    {
        // Arrange — the service returns InvalidState (system-edit block, 50062).
        var service = new Mock<IRelationshipsService>();
        service.Setup(s => s.UpdateAsync(RelationshipId, WorkspaceId, It.IsAny<RelationshipPatchRequest>(),
                UserId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new RelationshipMutationResult(
                   RelationshipMutationOutcome.InvalidState, null, null, "This relationship is system-managed."));

        // Act
        var result = await Build(service).Update(RelationshipId, WorkspaceId,
            new RelationshipPatchRequest("Renamed", null, null, null, null, null),
            CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, problem.StatusCode);
    }

    [Fact]
    public async Task Update_ShowAsTabWithBlankLabel_Returns400()
    {
        // Arrange — v2 review F-5: the tabLabel-when-showAsTab invariant now applies to PATCH too.
        var service = new Mock<IRelationshipsService>();

        // Act — explicit blank tabLabel paired with showOnFromAsTab=true.
        var result = await Build(service).Update(RelationshipId, WorkspaceId,
            new RelationshipPatchRequest(null, null, null, true, "   ", null),
            CancellationToken.None);

        // Assert
        var problem = Assert.IsType<BadRequestObjectResult>(result);
        var details = Assert.IsType<ValidationProblemDetails>(problem.Value);
        Assert.Contains("tabLabel", details.Errors.Keys);
    }

    [Fact]
    public async Task Update_NotFound_Returns404()
    {
        // Arrange
        var service = new Mock<IRelationshipsService>();
        service.Setup(s => s.UpdateAsync(RelationshipId, WorkspaceId, It.IsAny<RelationshipPatchRequest>(),
                UserId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new RelationshipMutationResult(
                   RelationshipMutationOutcome.NotFound, null, null, null));

        // Act
        var result = await Build(service).Update(RelationshipId, WorkspaceId,
            new RelationshipPatchRequest(null, null, null, null, null, null),
            CancellationToken.None);

        // Assert
        Assert.IsType<NotFoundResult>(result);
    }

    // ---------- Retire ----------

    [Fact]
    public async Task Retire_Success_Returns200()
    {
        // Arrange
        var service = new Mock<IRelationshipsService>();
        service.Setup(s => s.RetireAsync(RelationshipId, WorkspaceId, false, UserId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new RelationshipRetireResult(
                   RelationshipMutationOutcome.Success,
                   new RelationshipRetireResponse(RelationshipId, 0, true), null));

        // Act
        var result = await Build(service).Retire(RelationshipId, WorkspaceId, false, CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task Retire_BlockedByLinks_Returns409WithCount()
    {
        // Arrange — force=false, 5 live links → 409 with the count so the S30 editor confirms.
        var service = new Mock<IRelationshipsService>();
        service.Setup(s => s.RetireAsync(RelationshipId, WorkspaceId, false, UserId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new RelationshipRetireResult(
                   RelationshipMutationOutcome.Success,
                   new RelationshipRetireResponse(RelationshipId, 5, false), null));

        // Act
        var result = await Build(service).Retire(RelationshipId, WorkspaceId, false, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, problem.StatusCode);
        var body = Assert.IsType<RelationshipRetireResponse>(problem.Value);
        Assert.Equal(5, body.LinkCount);
        Assert.False(body.Retired);
    }

    [Fact]
    public async Task Retire_ForceTrue_Returns200EvenWithLinks()
    {
        // Arrange — force=true drives the retire home even with links.
        var service = new Mock<IRelationshipsService>();
        service.Setup(s => s.RetireAsync(RelationshipId, WorkspaceId, true, UserId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new RelationshipRetireResult(
                   RelationshipMutationOutcome.Success,
                   new RelationshipRetireResponse(RelationshipId, 5, true), null));

        // Act
        var result = await Build(service).Retire(RelationshipId, WorkspaceId, true, CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task Retire_NotFound_Returns404()
    {
        // Arrange — v2 review F-4: the proc's ErrNotFound (50060) must surface as 404, not a silent 200.
        var service = new Mock<IRelationshipsService>();
        service.Setup(s => s.RetireAsync(RelationshipId, WorkspaceId, false, UserId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new RelationshipRetireResult(
                   RelationshipMutationOutcome.NotFound, null, "Relationship not found."));

        // Act
        var result = await Build(service).Retire(RelationshipId, WorkspaceId, false, CancellationToken.None);

        // Assert
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Retire_SystemBlock_Returns409()
    {
        // Arrange — v2 review F-4: system-relationship block (ErrSystem 50062) must surface as 409, not 200.
        var service = new Mock<IRelationshipsService>();
        service.Setup(s => s.RetireAsync(RelationshipId, WorkspaceId, false, UserId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new RelationshipRetireResult(
                   RelationshipMutationOutcome.InvalidState, null, "System relationship cannot be retired."));

        // Act
        var result = await Build(service).Retire(RelationshipId, WorkspaceId, false, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, problem.StatusCode);
    }

    // ---------- Restore ----------

    [Fact]
    public async Task Restore_Success_Returns200()
    {
        // Arrange
        var service = new Mock<IRelationshipsService>();
        service.Setup(s => s.RestoreAsync(RelationshipId, WorkspaceId, UserId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new RelationshipMutationResult(
                   RelationshipMutationOutcome.Success, SampleDto(), null, null));

        // Act
        var result = await Build(service).Restore(RelationshipId, WorkspaceId, CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task Restore_SystemBlock_Returns409()
    {
        // Arrange
        var service = new Mock<IRelationshipsService>();
        service.Setup(s => s.RestoreAsync(RelationshipId, WorkspaceId, UserId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new RelationshipMutationResult(
                   RelationshipMutationOutcome.InvalidState, null, null, "system-managed"));

        // Act
        var result = await Build(service).Restore(RelationshipId, WorkspaceId, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, problem.StatusCode);
    }

    [Fact]
    public async Task Restore_NonAdmin_Returns403()
    {
        // Arrange
        var service = new Mock<IRelationshipsService>();

        // Act
        var result = await Build(service, isAdmin: false)
            .Restore(RelationshipId, WorkspaceId, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }
}

// Unit tests for RecordLinksController (Slice 25) — the record-side relationship-driven
// link endpoints. The service and access guard are mocked. Covers happy paths per verb,
// validation branches on create (missing target, self-link), 403-not-404 access gating,
// and the InvalidState → 409 branch for the retired-relationship block.

using McDermott.AiTracker.Api.Modules.Relationships;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class RecordLinksControllerTests
{
    private static readonly Guid WorkspaceId = new("B0000000-0000-4000-8000-000000000001");
    private static readonly Guid UserId = new("B0000000-0000-4000-8000-000000000002");
    private static readonly Guid RelationshipId = new("B0000000-0000-4000-8000-000000000003");
    private static readonly Guid LinkId = new("B0000000-0000-4000-8000-000000000004");
    private const string FromRecordId = "AIS-00000001";
    private const string ToRecordId = "AIS-00000009";

    private static RecordLinksController Build(
        Mock<IRelationshipsService> service,
        bool isViewer = true,
        bool isMember = true)
    {
        var accessGuard = new Mock<IAccessGuard>();
        accessGuard.Setup(guard => guard.HasWorkspaceLevelAsync(
            UserId, WorkspaceId, WorkspaceLevel.Viewer, It.IsAny<CancellationToken>())).ReturnsAsync(isViewer);
        accessGuard.Setup(guard => guard.HasWorkspaceLevelAsync(
            UserId, WorkspaceId, WorkspaceLevel.Member, It.IsAny<CancellationToken>())).ReturnsAsync(isMember);

        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        var httpContext = new DefaultHttpContext();
        httpContext.Items[OperationIdMiddleware.HeaderName] = "op-1";

        return new RecordLinksController(service.Object, accessGuard.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };
    }

    private static RelationshipLinkDto SampleLink() => new(
        LinkId, RelationshipId, FromRecordId, ToRecordId,
        "Extraction task", "execution", "Out",
        CreatedAt: DateTime.UtcNow, CreatedBy: "seed");

    // ---------- List ----------

    [Fact]
    public async Task List_ViewerCanRead_Returns200()
    {
        // Arrange
        var service = new Mock<IRelationshipsService>();
        service.Setup(s => s.ListRecordLinksAsync(WorkspaceId, FromRecordId, null, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new[] { SampleLink() });

        // Act
        var result = await Build(service).List(FromRecordId, WorkspaceId, null, CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task List_NoMembership_Returns403()
    {
        // Arrange
        var service = new Mock<IRelationshipsService>();

        // Act
        var result = await Build(service, isViewer: false)
            .List(FromRecordId, WorkspaceId, null, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    // ---------- Create ----------

    [Fact]
    public async Task Create_Valid_Returns201()
    {
        // Arrange
        var service = new Mock<IRelationshipsService>();
        service.Setup(s => s.CreateRecordLinkAsync(WorkspaceId, FromRecordId, RelationshipId, ToRecordId,
                UserId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new RecordLinkMutationResult(
                   RelationshipMutationOutcome.Success, SampleLink(), null));

        // Act
        var result = await Build(service).Create(FromRecordId, WorkspaceId,
            new RelationshipLinkCreateRequest(RelationshipId, ToRecordId), CancellationToken.None);

        // Assert
        var created = Assert.IsType<CreatedResult>(result);
        Assert.Equal(StatusCodes.Status201Created, created.StatusCode);
    }

    [Fact]
    public async Task Create_MissingTarget_Returns400()
    {
        // Arrange
        var service = new Mock<IRelationshipsService>();

        // Act
        var result = await Build(service).Create(FromRecordId, WorkspaceId,
            new RelationshipLinkCreateRequest(RelationshipId, "  "), CancellationToken.None);

        // Assert
        var problem = Assert.IsType<BadRequestObjectResult>(result);
        var details = Assert.IsType<ValidationProblemDetails>(problem.Value);
        Assert.Contains("toRecordId", details.Errors.Keys);
    }

    [Fact]
    public async Task Create_SelfLink_Returns400()
    {
        // Arrange — a record cannot link to itself.
        var service = new Mock<IRelationshipsService>();

        // Act
        var result = await Build(service).Create(FromRecordId, WorkspaceId,
            new RelationshipLinkCreateRequest(RelationshipId, FromRecordId), CancellationToken.None);

        // Assert
        var problem = Assert.IsType<BadRequestObjectResult>(result);
        var details = Assert.IsType<ValidationProblemDetails>(problem.Value);
        Assert.Contains("toRecordId", details.Errors.Keys);
    }

    [Fact]
    public async Task Create_NonMember_Returns403()
    {
        // Arrange
        var service = new Mock<IRelationshipsService>();

        // Act
        var result = await Build(service, isMember: false).Create(FromRecordId, WorkspaceId,
            new RelationshipLinkCreateRequest(RelationshipId, ToRecordId), CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task Create_RetiredRelationship_Returns409()
    {
        // Arrange — the service returns InvalidState (retired-relationship block, 50063).
        var service = new Mock<IRelationshipsService>();
        service.Setup(s => s.CreateRecordLinkAsync(WorkspaceId, FromRecordId, RelationshipId, ToRecordId,
                UserId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new RecordLinkMutationResult(
                   RelationshipMutationOutcome.InvalidState, null, "Relationship is retired."));

        // Act
        var result = await Build(service).Create(FromRecordId, WorkspaceId,
            new RelationshipLinkCreateRequest(RelationshipId, ToRecordId), CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, problem.StatusCode);
    }

    [Fact]
    public async Task Create_RecordNotInWorkspace_Returns404()
    {
        // Arrange — v2 review F-3 (A01 IDOR): the proc now validates that FromRecordId/ToRecordId
        // belong to the workspace. Foreign or nonexistent records surface via ErrRecordNotInWs (50067)
        // → the service returns NotFound → controller returns 404.
        var service = new Mock<IRelationshipsService>();
        service.Setup(s => s.CreateRecordLinkAsync(WorkspaceId, FromRecordId, RelationshipId, ToRecordId,
                UserId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new RecordLinkMutationResult(
                   RelationshipMutationOutcome.NotFound, null, "From record is not in this workspace."));

        // Act
        var result = await Build(service).Create(FromRecordId, WorkspaceId,
            new RelationshipLinkCreateRequest(RelationshipId, ToRecordId), CancellationToken.None);

        // Assert
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Create_RelationshipMissing_Returns404()
    {
        // Arrange — the service returns NotFound (50060).
        var service = new Mock<IRelationshipsService>();
        service.Setup(s => s.CreateRecordLinkAsync(WorkspaceId, FromRecordId, RelationshipId, ToRecordId,
                UserId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new RecordLinkMutationResult(
                   RelationshipMutationOutcome.NotFound, null, "Relationship not found."));

        // Act
        var result = await Build(service).Create(FromRecordId, WorkspaceId,
            new RelationshipLinkCreateRequest(RelationshipId, ToRecordId), CancellationToken.None);

        // Assert
        Assert.IsType<NotFoundResult>(result);
    }

    // ---------- Delete ----------

    [Fact]
    public async Task Delete_Success_Returns204()
    {
        // Arrange
        var service = new Mock<IRelationshipsService>();
        service.Setup(s => s.DeleteRecordLinkAsync(
                LinkId, WorkspaceId, FromRecordId, UserId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new RecordLinkMutationResult(
                   RelationshipMutationOutcome.Success, null, null));

        // Act
        var result = await Build(service).Delete(FromRecordId, LinkId, WorkspaceId, CancellationToken.None);

        // Assert
        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task Delete_LinkNotOnRecord_Returns404()
    {
        // Arrange — v2 review F-2 (A01 path-scoping bypass): if the link exists in the workspace
        // but its endpoints don't match the route recordId, the proc raises 50068 and the service
        // returns NotFound.
        var service = new Mock<IRelationshipsService>();
        service.Setup(s => s.DeleteRecordLinkAsync(
                LinkId, WorkspaceId, FromRecordId, UserId, It.IsAny<CancellationToken>()))
               .ReturnsAsync(new RecordLinkMutationResult(
                   RelationshipMutationOutcome.NotFound, null, "Link not on this record."));

        // Act
        var result = await Build(service).Delete(FromRecordId, LinkId, WorkspaceId, CancellationToken.None);

        // Assert
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Delete_NonMember_Returns403()
    {
        // Arrange
        var service = new Mock<IRelationshipsService>();

        // Act
        var result = await Build(service, isMember: false)
            .Delete(FromRecordId, LinkId, WorkspaceId, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }
}

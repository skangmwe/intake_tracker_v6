// Unit tests for RequestsController and DraftsController — routing, access mapping, and status-code
// mapping only (the services and access guard are mocked). Covers the create/query/detail/patch/
// stage/hold happy paths, each mapped failure outcome, the access-denied (403 never 404) branches,
// and cancellation-token propagation (api-testing-guidelines.md). Real cross-field validation is
// exercised in RequestsValidationTests; here the service is mocked to a ValidationFailed outcome.

using System.Text.Json;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class RequestsControllerTests
{
    private static readonly Guid WorkspaceId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();
    private const string RecordId = "AI-00000042";

    private static RequestsController Build(
        Mock<IRequestsService> requests,
        bool isViewer = true,
        bool isMember = true)
    {
        var accessGuard = new Mock<IAccessGuard>();
        accessGuard.Setup(guard => guard.HasWorkspaceLevelAsync(UserId, WorkspaceId, WorkspaceLevel.Viewer, It.IsAny<CancellationToken>())).ReturnsAsync(isViewer);
        accessGuard.Setup(guard => guard.HasWorkspaceLevelAsync(UserId, WorkspaceId, WorkspaceLevel.Member, It.IsAny<CancellationToken>())).ReturnsAsync(isMember);

        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        var httpContext = new DefaultHttpContext();
        httpContext.Items[OperationIdMiddleware.HeaderName] = "op-123";

        return new RequestsController(requests.Object, accessGuard.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };
    }

    private static RequestDto SampleRequestDto() => new(
        RecordId, WorkspaceId, "AI Solutions", DateTime.UtcNow, DateTime.UtcNow, UserId.ToString(), UserId.ToString(),
        LegacyId: null, LifecycleId: Guid.NewGuid(),
        Stages: new[] { new RequestStageRef("intake", "Intake") },
        Stage: "intake", Hold: new HoldState(false, null), Outcome: null, DisplayStatus: "Intake", SlaStatus: null, TimeInStage: null,
        Name: "Doc extraction", Description: "Pull fields", Fields: new Dictionary<string, JsonElement>(),
        Bridge: null, ETag: "AAAAAAAAB9E=");

    [Fact]
    public async Task CreateRequest_MemberSucceeds_Returns201()
    {
        // Arrange
        var requests = new Mock<IRequestsService>();
        requests.Setup(service => service.CreateAsync(WorkspaceId, It.IsAny<RequestCreateRequest>(), UserId, "op-123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new RequestCreateResult(RequestWriteOutcome.Success, SampleRequestDto()));

        // Act
        var result = await Build(requests).CreateRequest(WorkspaceId, new RequestCreateRequest { Name = "Doc extraction" }, CancellationToken.None);

        // Assert
        var created = Assert.IsType<CreatedResult>(result);
        Assert.Equal($"/api/v1/requests/{RecordId}", created.Location);
    }

    [Fact]
    public async Task CreateRequest_NotAMember_Returns403()
    {
        // Arrange
        var requests = new Mock<IRequestsService>();

        // Act
        var result = await Build(requests, isMember: false).CreateRequest(WorkspaceId, new RequestCreateRequest { Name = "x" }, CancellationToken.None);

        // Assert — ownership violation is 403, never 404 (api-error-handling.md).
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task CreateRequest_NameMissing_Returns400()
    {
        // Arrange
        var requests = new Mock<IRequestsService>();
        requests.Setup(service => service.CreateAsync(WorkspaceId, It.IsAny<RequestCreateRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new RequestCreateResult(RequestWriteOutcome.ValidationFailed,
                Errors: new Dictionary<string, string[]> { ["name"] = new[] { "A request name is required." } }));

        // Act
        var result = await Build(requests).CreateRequest(WorkspaceId, new RequestCreateRequest(), CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
        Assert.Contains("name", Assert.IsType<ValidationProblemDetails>(problem.Value).Errors.Keys);
    }

    [Fact]
    public async Task CreateRequest_ClientNumberMissing_Returns400()
    {
        // Arrange
        var requests = new Mock<IRequestsService>();
        requests.Setup(service => service.CreateAsync(WorkspaceId, It.IsAny<RequestCreateRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new RequestCreateResult(RequestWriteOutcome.ValidationFailed,
                Errors: new Dictionary<string, string[]> { ["clientNumber"] = new[] { "A client number is required when Dept/PG/Client is Client." } }));

        // Act
        var result = await Build(requests).CreateRequest(WorkspaceId, new RequestCreateRequest { Name = "x" }, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
        Assert.Contains("clientNumber", Assert.IsType<ValidationProblemDetails>(problem.Value).Errors.Keys);
    }

    [Fact]
    public async Task QueryRequests_NotAViewer_Returns403()
    {
        // Arrange
        var requests = new Mock<IRequestsService>();

        // Act
        var result = await Build(requests, isViewer: false).QueryRequests(WorkspaceId, new PaginatedQuery(), CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task QueryRequests_ViewerSucceeds_ReturnsOk()
    {
        // Arrange
        var page = new PaginatedResponse<RequestListRow>(Array.Empty<RequestListRow>(), 0, 1, 20);
        var requests = new Mock<IRequestsService>();
        requests.Setup(service => service.QueryAsync(WorkspaceId, It.IsAny<PaginatedQuery>(), It.IsAny<CancellationToken>())).ReturnsAsync(page);

        // Act
        var result = await Build(requests).QueryRequests(WorkspaceId, new PaginatedQuery(), CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Same(page, ok.Value);
    }

    [Fact]
    public async Task GetRequest_ServiceReturnsRecord_ReturnsOk()
    {
        // Arrange
        var dto = SampleRequestDto();
        var requests = new Mock<IRequestsService>();
        requests.Setup(service => service.GetByIdAsync(RecordId, UserId, It.IsAny<CancellationToken>())).ReturnsAsync(dto);

        // Act
        var result = await Build(requests).GetRequest(RecordId, CancellationToken.None);

        // Assert
        Assert.Same(dto, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Fact]
    public async Task GetRequest_NoAccessibleRecord_Returns403()
    {
        // Arrange — a record the caller cannot see, or no such record, is 403 (never 404 — BS §22.6).
        var requests = new Mock<IRequestsService>();
        requests.Setup(service => service.GetByIdAsync(RecordId, UserId, It.IsAny<CancellationToken>())).ReturnsAsync((RequestDto?)null);

        // Act
        var result = await Build(requests).GetRequest(RecordId, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task UpdateRequest_Success_ReturnsOk()
    {
        // Arrange
        var dto = SampleRequestDto();
        var requests = new Mock<IRequestsService>();
        requests.Setup(service => service.PatchAsync(RecordId, It.IsAny<RequestPatchRequest>(), "AAAAAAAAB9E=", UserId, "op-123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new RequestPatchResult(RequestWriteOutcome.Success, dto));

        // Act
        var result = await Build(requests).UpdateRequest(RecordId, new RequestPatchRequest { IfMatch = "AAAAAAAAB9E=" }, CancellationToken.None);

        // Assert
        Assert.Same(dto, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Fact]
    public async Task UpdateRequest_MissingIfMatch_Returns400()
    {
        // Arrange
        var requests = new Mock<IRequestsService>();

        // Act
        var result = await Build(requests).UpdateRequest(RecordId, new RequestPatchRequest(), CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
    }

    [Fact]
    public async Task UpdateRequest_StaleOutcome_Returns409()
    {
        // Arrange
        var requests = new Mock<IRequestsService>();
        requests.Setup(service => service.PatchAsync(RecordId, It.IsAny<RequestPatchRequest>(), It.IsAny<string>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new RequestPatchResult(RequestWriteOutcome.Stale));

        // Act
        var result = await Build(requests).UpdateRequest(RecordId, new RequestPatchRequest { IfMatch = "AAAAAAAAB9E=" }, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, problem.StatusCode);
        Assert.Equal("https://mws.ai/errors/stale-record", Assert.IsType<ProblemDetails>(problem.Value).Type);
    }

    [Fact]
    public async Task UpdateRequest_NotFoundOutcome_Returns403()
    {
        // Arrange — a not-found record masks as denied (never 404).
        var requests = new Mock<IRequestsService>();
        requests.Setup(service => service.PatchAsync(RecordId, It.IsAny<RequestPatchRequest>(), It.IsAny<string>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new RequestPatchResult(RequestWriteOutcome.Denied));

        // Act
        var result = await Build(requests).UpdateRequest(RecordId, new RequestPatchRequest { IfMatch = "AAAAAAAAB9E=" }, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task MoveStage_Success_ReturnsOk()
    {
        // Arrange
        var requests = new Mock<IRequestsService>();
        requests.Setup(service => service.SetStageAsync(RecordId, "build", UserId, "op-123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new StageMoveResult(StageMoveOutcome.Success, new StageTransitionResultDto(true, "build")));

        // Act
        var result = await Build(requests).MoveStage(RecordId, new StageTransitionRequest { ToStage = "build" }, CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Equal("build", Assert.IsType<StageTransitionResultDto>(ok.Value).NewStage);
    }

    [Fact]
    public async Task MoveStage_InvalidStage_Returns400()
    {
        // Arrange
        var requests = new Mock<IRequestsService>();
        requests.Setup(service => service.SetStageAsync(RecordId, "bogus", UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new StageMoveResult(StageMoveOutcome.InvalidStage));

        // Act
        var result = await Build(requests).MoveStage(RecordId, new StageTransitionRequest { ToStage = "bogus" }, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
    }

    [Fact]
    public async Task SetHold_Success_Returns204()
    {
        // Arrange
        var requests = new Mock<IRequestsService>();
        requests.Setup(service => service.SetHoldAsync(RecordId, true, "Waiting on client", UserId, "op-123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(RequestWriteOutcome.Success);

        // Act
        var result = await Build(requests).SetHold(RecordId, new HoldInput { Held = true, Reason = "Waiting on client" }, CancellationToken.None);

        // Assert
        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task SetHold_Denied_Returns403()
    {
        // Arrange
        var requests = new Mock<IRequestsService>();
        requests.Setup(service => service.SetHoldAsync(RecordId, false, null, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(RequestWriteOutcome.Denied);

        // Act
        var result = await Build(requests).SetHold(RecordId, new HoldInput { Held = false }, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task CreateRequest_CancellationPropagates()
    {
        // Arrange — a cancelled token surfaces as an OperationCanceledException, not a swallowed result.
        var requests = new Mock<IRequestsService>();
        requests.Setup(service => service.CreateAsync(WorkspaceId, It.IsAny<RequestCreateRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(requests).CreateRequest(WorkspaceId, new RequestCreateRequest { Name = "x" }, cts.Token));
    }
}

public sealed class DraftsControllerTests
{
    private static readonly Guid WorkspaceId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid DraftId = Guid.NewGuid();

    private static DraftsController Build(Mock<IDraftsService> drafts)
    {
        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        return new DraftsController(drafts.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
    }

    private static DraftDto SampleDraft() => new(
        DraftId, WorkspaceId, "Request", "Untitled",
        new DraftBodyDto(new Dictionary<string, JsonElement>(), null), DateTime.UtcNow);

    [Fact]
    public async Task SaveDraft_Created_Returns201()
    {
        // Arrange
        var draft = SampleDraft();
        var drafts = new Mock<IDraftsService>();
        drafts.Setup(service => service.SaveAsync(WorkspaceId, UserId, It.IsAny<DraftSaveRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new DraftSaveResult(draft, Created: true));

        // Act
        var request = new DraftSaveRequest { ObjectType = "Request", Body = new DraftBodyInput() };
        var result = await Build(drafts).SaveDraft(WorkspaceId, request, CancellationToken.None);

        // Assert
        var created = Assert.IsType<CreatedResult>(result);
        Assert.Equal($"/api/v1/drafts/{DraftId}", created.Location);
    }

    [Fact]
    public async Task SaveDraft_Updated_ReturnsOk()
    {
        // Arrange
        var drafts = new Mock<IDraftsService>();
        drafts.Setup(service => service.SaveAsync(WorkspaceId, UserId, It.IsAny<DraftSaveRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new DraftSaveResult(SampleDraft(), Created: false));

        // Act
        var request = new DraftSaveRequest { Id = DraftId, ObjectType = "Request", Body = new DraftBodyInput() };
        var result = await Build(drafts).SaveDraft(WorkspaceId, request, CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task ListDrafts_OwnerScoped_ReturnsOk()
    {
        // Arrange
        var rows = new[] { new DraftListRow(DraftId, "Untitled", "Request", DateTime.UtcNow) };
        var drafts = new Mock<IDraftsService>();
        drafts.Setup(service => service.ListAsync(WorkspaceId, UserId, It.IsAny<CancellationToken>())).ReturnsAsync(rows);

        // Act
        var result = await Build(drafts).ListDrafts(WorkspaceId, CancellationToken.None);

        // Assert — scoped to the current user only.
        Assert.Same(rows, Assert.IsType<OkObjectResult>(result).Value);
        drafts.Verify(service => service.ListAsync(WorkspaceId, UserId, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task GetDraft_NotYours_Returns403()
    {
        // Arrange
        var drafts = new Mock<IDraftsService>();
        drafts.Setup(service => service.GetAsync(DraftId, UserId, It.IsAny<CancellationToken>())).ReturnsAsync((DraftDto?)null);

        // Act
        var result = await Build(drafts).GetDraft(DraftId, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task DeleteDraft_NotOwner_Returns403()
    {
        // Arrange — a non-owner delete affects zero rows and is denied (never 404).
        var drafts = new Mock<IDraftsService>();
        drafts.Setup(service => service.DeleteAsync(DraftId, UserId, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        // Act
        var result = await Build(drafts).DeleteDraft(DraftId, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task DeleteDraft_Owner_Returns204()
    {
        // Arrange
        var drafts = new Mock<IDraftsService>();
        drafts.Setup(service => service.DeleteAsync(DraftId, UserId, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        // Act
        var result = await Build(drafts).DeleteDraft(DraftId, CancellationToken.None);

        // Assert
        Assert.IsType<NoContentResult>(result);
    }
}

// Unit tests for PlatformAnnouncementsController (routing / validation / status-code mapping — the service
// and access guard are mocked). Covers the platform-admin gate on every route (403 non-admin), target
// resolution ('all' fans out to every workspace; 'specific' with no ids → 400; an unknown id → 400), write-
// status validation (400), the mutation-outcome mapping (Success→200, InvalidState→409), and cancellation.
// The DB-backed behaviours (fan-out, grouped read, broadcast edit/retire) are covered by tSQLt.

using McDermott.AiTracker.Api.Modules.Announcements;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class PlatformAnnouncementsControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid BroadcastId = Guid.NewGuid();
    private static readonly Guid WsA = Guid.NewGuid();
    private static readonly Guid WsB = Guid.NewGuid();

    private static readonly IReadOnlyList<PlatformWorkspaceDto> Workspaces = new[]
    {
        new PlatformWorkspaceDto(WsA, "AI Solutions", "ai-solutions"),
        new PlatformWorkspaceDto(WsB, "Litigation", "pg-dept"),
    };

    private static PlatformAnnouncementsController Build(
        Mock<IAnnouncementsService> service, bool isPlatformAdmin)
    {
        var guard = new Mock<IAccessGuard>();
        guard.Setup(check => check.IsPlatformAdminAsync(UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(isPlatformAdmin);
        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);
        return new PlatformAnnouncementsController(service.Object, guard.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
    }

    private static Mock<IAnnouncementsService> ServiceWithWorkspaces()
    {
        var service = new Mock<IAnnouncementsService>();
        service.Setup(svc => svc.ListPlatformWorkspacesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(Workspaces);
        return service;
    }

    private static PlatformAnnouncementCreateRequest CreateRequest(PlatformAnnouncementTarget target) => new()
    {
        Title = "Firm notice",
        Body = "Body",
        Status = "Active",
        Target = target,
    };

    private static int StatusOf(IActionResult result) => result switch
    {
        ObjectResult objectResult => objectResult.StatusCode ?? 0,
        StatusCodeResult statusResult => statusResult.StatusCode,
        _ => 0,
    };

    [Fact]
    public async Task ListWorkspaces_Admin_ReturnsOk()
    {
        var service = ServiceWithWorkspaces();
        var result = await Build(service, isPlatformAdmin: true).ListWorkspaces(CancellationToken.None);
        Assert.Same(Workspaces, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Fact]
    public async Task ListWorkspaces_NotAdmin_Returns403()
    {
        var service = ServiceWithWorkspaces();
        var result = await Build(service, isPlatformAdmin: false).ListWorkspaces(CancellationToken.None);
        Assert.Equal(StatusCodes.Status403Forbidden, StatusOf(result));
    }

    [Fact]
    public async Task Create_NotAdmin_Returns403()
    {
        var service = ServiceWithWorkspaces();
        var request = CreateRequest(new PlatformAnnouncementTarget { Kind = "all" });
        var result = await Build(service, isPlatformAdmin: false).Create(request, CancellationToken.None);
        Assert.Equal(StatusCodes.Status403Forbidden, StatusOf(result));
        service.Verify(svc => svc.CreatePlatformBroadcastAsync(
            It.IsAny<PlatformAnnouncementCreateRequest>(), It.IsAny<IReadOnlyList<Guid>>(),
            It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Create_AllWorkspaces_FansOutToEveryWorkspace()
    {
        // Arrange
        var service = ServiceWithWorkspaces();
        IReadOnlyList<Guid>? captured = null;
        service.Setup(svc => svc.CreatePlatformBroadcastAsync(
                It.IsAny<PlatformAnnouncementCreateRequest>(), It.IsAny<IReadOnlyList<Guid>>(),
                UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Callback<PlatformAnnouncementCreateRequest, IReadOnlyList<Guid>, Guid, string, CancellationToken>(
                (_, ids, _, _, _) => captured = ids)
            .ReturnsAsync(new PlatformAnnouncementCreatedDto(BroadcastId, 2));
        var request = CreateRequest(new PlatformAnnouncementTarget { Kind = "all" });

        // Act
        var result = await Build(service, isPlatformAdmin: true).Create(request, CancellationToken.None);

        // Assert
        var created = Assert.IsType<PlatformAnnouncementCreatedDto>(Assert.IsType<CreatedResult>(result).Value);
        Assert.Equal(2, created.WorkspaceCount);
        Assert.NotNull(captured);
        Assert.Equal(new[] { WsA, WsB }.OrderBy(id => id), captured!.OrderBy(id => id));
    }

    [Fact]
    public async Task Create_SpecificWithNoIds_Returns400()
    {
        var service = ServiceWithWorkspaces();
        var request = CreateRequest(new PlatformAnnouncementTarget { Kind = "specific", WorkspaceIds = Array.Empty<Guid>() });
        var result = await Build(service, isPlatformAdmin: true).Create(request, CancellationToken.None);
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Create_SpecificWithUnknownId_Returns400()
    {
        var service = ServiceWithWorkspaces();
        var request = CreateRequest(new PlatformAnnouncementTarget
        {
            Kind = "specific",
            WorkspaceIds = new[] { WsA, Guid.NewGuid() },
        });
        var result = await Build(service, isPlatformAdmin: true).Create(request, CancellationToken.None);
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Create_ScheduledWithoutTime_Returns400()
    {
        var service = ServiceWithWorkspaces();
        var request = CreateRequest(new PlatformAnnouncementTarget { Kind = "all" });
        request.Status = "Scheduled";
        request.ScheduledPublishAt = null;
        var result = await Build(service, isPlatformAdmin: true).Create(request, CancellationToken.None);
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Query_Admin_ReturnsOk()
    {
        var page = new PaginatedResponse<PlatformAnnouncementRow>(Array.Empty<PlatformAnnouncementRow>(), 0, 1, 20);
        var service = new Mock<IAnnouncementsService>();
        service.Setup(svc => svc.QueryPlatformAsync(1, 20, It.IsAny<CancellationToken>())).ReturnsAsync(page);
        var result = await Build(service, isPlatformAdmin: true).Query(new AnnouncementQuery(), CancellationToken.None);
        Assert.Same(page, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Fact]
    public async Task Query_NotAdmin_Returns403()
    {
        var service = new Mock<IAnnouncementsService>();
        var result = await Build(service, isPlatformAdmin: false).Query(new AnnouncementQuery(), CancellationToken.None);
        Assert.Equal(StatusCodes.Status403Forbidden, StatusOf(result));
    }

    [Fact]
    public async Task Update_Success_ReturnsOk()
    {
        var service = new Mock<IAnnouncementsService>();
        service.Setup(svc => svc.UpdateBroadcastAsync(
                BroadcastId, It.IsAny<PlatformAnnouncementPatchRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AnnouncementMutationResult(AnnouncementMutationOutcome.Success, null));
        var request = new PlatformAnnouncementPatchRequest { Title = "New", Body = "B", Pinned = false, Status = "Active" };
        var result = await Build(service, isPlatformAdmin: true).Update(BroadcastId, request, CancellationToken.None);
        Assert.Equal(StatusCodes.Status200OK, StatusOf(result));
    }

    [Fact]
    public async Task Update_InvalidState_Returns409()
    {
        var service = new Mock<IAnnouncementsService>();
        service.Setup(svc => svc.UpdateBroadcastAsync(
                BroadcastId, It.IsAny<PlatformAnnouncementPatchRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AnnouncementMutationResult(AnnouncementMutationOutcome.InvalidState, null));
        var request = new PlatformAnnouncementPatchRequest { Title = "New", Body = "B", Pinned = false, Status = "Active" };
        var result = await Build(service, isPlatformAdmin: true).Update(BroadcastId, request, CancellationToken.None);
        Assert.Equal(StatusCodes.Status409Conflict, StatusOf(result));
    }

    [Fact]
    public async Task Update_NotAdmin_Returns403()
    {
        var service = new Mock<IAnnouncementsService>();
        var request = new PlatformAnnouncementPatchRequest { Title = "New", Body = "B", Pinned = false, Status = "Active" };
        var result = await Build(service, isPlatformAdmin: false).Update(BroadcastId, request, CancellationToken.None);
        Assert.Equal(StatusCodes.Status403Forbidden, StatusOf(result));
    }

    [Fact]
    public async Task Retire_Success_ReturnsOk()
    {
        var service = new Mock<IAnnouncementsService>();
        service.Setup(svc => svc.RetireBroadcastAsync(BroadcastId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AnnouncementMutationResult(AnnouncementMutationOutcome.Success, null));
        var result = await Build(service, isPlatformAdmin: true).Retire(BroadcastId, CancellationToken.None);
        Assert.Equal(StatusCodes.Status200OK, StatusOf(result));
    }

    [Fact]
    public async Task Retire_NotAdmin_Returns403()
    {
        var service = new Mock<IAnnouncementsService>();
        var result = await Build(service, isPlatformAdmin: false).Retire(BroadcastId, CancellationToken.None);
        Assert.Equal(StatusCodes.Status403Forbidden, StatusOf(result));
    }

    [Fact]
    public async Task Create_CancellationPropagates()
    {
        // Arrange
        var service = ServiceWithWorkspaces();
        service.Setup(svc => svc.CreatePlatformBroadcastAsync(
                It.IsAny<PlatformAnnouncementCreateRequest>(), It.IsAny<IReadOnlyList<Guid>>(),
                UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        var request = CreateRequest(new PlatformAnnouncementTarget { Kind = "all" });
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(
            () => Build(service, isPlatformAdmin: true).Create(request, cts.Token));
    }
}

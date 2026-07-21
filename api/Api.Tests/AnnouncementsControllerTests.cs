// Unit tests for AnnouncementsController (routing / validation / status-code mapping — the service and
// access guard are mocked). Covers audience validation (400), the WorkspaceAdmin gate on create/manage
// (403), audience-gated detail (403 on null, never disclosing existence), the mutation-outcome mapping
// (Success→200, Forbidden→403, InvalidState→409), and cancellation propagation (api-testing-guidelines.md).
// The DB-backed behaviours (audience resolution, publish/retire transitions) are covered by tSQLt.

using McDermott.AiTracker.Api.Modules.Announcements;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class AnnouncementsControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid WorkspaceId = Guid.NewGuid();
    private static readonly Guid AnnouncementId = Guid.NewGuid();

    private static readonly AnnouncementAudience Everyone = new("everyone", null, null);

    private static AnnouncementDto SampleDto(string status = "Active") => new(
        AnnouncementId, WorkspaceId, "Coverage news", "Body", Everyone, false, null, status, UserId,
        DateTime.UtcNow, DateTime.UtcNow, null, null, true, null);

    private static AnnouncementsController Build(
        Mock<IAnnouncementsService> service, Mock<IAccessGuard>? accessGuard = null)
    {
        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);
        return new AnnouncementsController(service.Object, (accessGuard ?? new Mock<IAccessGuard>()).Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
    }

    private static Mock<IAccessGuard> AdminGuard(bool isAdmin)
    {
        var guard = new Mock<IAccessGuard>();
        guard.Setup(check => check.HasWorkspaceLevelAsync(UserId, WorkspaceId, WorkspaceLevel.WorkspaceAdmin, It.IsAny<CancellationToken>()))
            .ReturnsAsync(isAdmin);
        return guard;
    }

    [Fact]
    public async Task Query_ReturnsOkWithPage()
    {
        // Arrange
        var page = new PaginatedResponse<AnnouncementListRow>(Array.Empty<AnnouncementListRow>(), 0, 1, 20);
        var service = new Mock<IAnnouncementsService>();
        service.Setup(svc => svc.QueryAsync(UserId, 1, 20, It.IsAny<CancellationToken>())).ReturnsAsync(page);

        // Act
        var result = await Build(service).Query(new AnnouncementQuery(), CancellationToken.None);

        // Assert
        Assert.Same(page, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Fact]
    public async Task GetById_Found_ReturnsOk()
    {
        // Arrange
        var service = new Mock<IAnnouncementsService>();
        service.Setup(svc => svc.GetByIdAsync(AnnouncementId, UserId, It.IsAny<CancellationToken>())).ReturnsAsync(SampleDto());

        // Act
        var result = await Build(service).GetById(AnnouncementId, CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task GetById_NotVisible_Returns403()
    {
        // Arrange — null means "not visible" → 403, never disclosing existence.
        var service = new Mock<IAnnouncementsService>();
        service.Setup(svc => svc.GetByIdAsync(AnnouncementId, UserId, It.IsAny<CancellationToken>())).ReturnsAsync((AnnouncementDto?)null);

        // Act
        var result = await Build(service).GetById(AnnouncementId, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Create_AsAdmin_Returns201()
    {
        // Arrange
        var service = new Mock<IAnnouncementsService>();
        service.Setup(svc => svc.CreateAsync(WorkspaceId, It.IsAny<AnnouncementCreateRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(SampleDto());
        var request = new AnnouncementCreateRequest { Title = "T", Body = "B", Audience = Everyone };

        // Act
        var result = await Build(service, AdminGuard(true)).Create(WorkspaceId, request, CancellationToken.None);

        // Assert
        Assert.IsType<CreatedResult>(result);
    }

    [Fact]
    public async Task Create_AsNonAdmin_Returns403()
    {
        // Arrange
        var service = new Mock<IAnnouncementsService>();
        var request = new AnnouncementCreateRequest { Title = "T", Body = "B", Audience = Everyone };

        // Act
        var result = await Build(service, AdminGuard(false)).Create(WorkspaceId, request, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
        service.Verify(svc => svc.CreateAsync(It.IsAny<Guid>(), It.IsAny<AnnouncementCreateRequest>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Create_RoleScopedWithoutRoles_Returns400()
    {
        // Arrange — role-scoped audience must name at least one role.
        var service = new Mock<IAnnouncementsService>();
        var request = new AnnouncementCreateRequest { Title = "T", Body = "B", Audience = new("role-scoped", Array.Empty<string>(), null) };

        // Act
        var result = await Build(service, AdminGuard(true)).Create(WorkspaceId, request, CancellationToken.None);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result);
        service.Verify(svc => svc.CreateAsync(It.IsAny<Guid>(), It.IsAny<AnnouncementCreateRequest>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Create_UnknownAudienceKind_Returns400()
    {
        // Arrange
        var service = new Mock<IAnnouncementsService>();
        var request = new AnnouncementCreateRequest { Title = "T", Body = "B", Audience = new("nobody", null, null) };

        // Act
        var result = await Build(service, AdminGuard(true)).Create(WorkspaceId, request, CancellationToken.None);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task QueryForManage_AsNonAdmin_Returns403()
    {
        // Arrange
        var service = new Mock<IAnnouncementsService>();

        // Act
        var result = await Build(service, AdminGuard(false)).QueryForManage(WorkspaceId, new AnnouncementQuery(), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Update_Success_ReturnsOk()
    {
        // Arrange
        var service = new Mock<IAnnouncementsService>();
        service.Setup(svc => svc.UpdateAsync(AnnouncementId, It.IsAny<AnnouncementPatchRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AnnouncementMutationResult(AnnouncementMutationOutcome.Success, SampleDto()));
        var request = new AnnouncementPatchRequest { Title = "T", Body = "B", Audience = Everyone };

        // Act
        var result = await Build(service).Update(AnnouncementId, request, CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task Update_Forbidden_Returns403()
    {
        // Arrange
        var service = new Mock<IAnnouncementsService>();
        service.Setup(svc => svc.UpdateAsync(AnnouncementId, It.IsAny<AnnouncementPatchRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AnnouncementMutationResult(AnnouncementMutationOutcome.Forbidden, null));
        var request = new AnnouncementPatchRequest { Title = "T", Body = "B", Audience = Everyone };

        // Act
        var result = await Build(service).Update(AnnouncementId, request, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Update_InvalidState_Returns409()
    {
        // Arrange — a Retired announcement is immutable.
        var service = new Mock<IAnnouncementsService>();
        service.Setup(svc => svc.UpdateAsync(AnnouncementId, It.IsAny<AnnouncementPatchRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AnnouncementMutationResult(AnnouncementMutationOutcome.InvalidState, null));
        var request = new AnnouncementPatchRequest { Title = "T", Body = "B", Audience = Everyone };

        // Act
        var result = await Build(service).Update(AnnouncementId, request, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status409Conflict, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Publish_InvalidState_Returns409()
    {
        // Arrange — publishing a Retired announcement is a conflict.
        var service = new Mock<IAnnouncementsService>();
        service.Setup(svc => svc.PublishAsync(AnnouncementId, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AnnouncementMutationResult(AnnouncementMutationOutcome.InvalidState, null));

        // Act
        var result = await Build(service).Publish(AnnouncementId, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status409Conflict, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Publish_Success_ReturnsOk()
    {
        // Arrange
        var service = new Mock<IAnnouncementsService>();
        service.Setup(svc => svc.PublishAsync(AnnouncementId, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AnnouncementMutationResult(AnnouncementMutationOutcome.Success, SampleDto("Published")));

        // Act
        var result = await Build(service).Publish(AnnouncementId, CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task Retire_Forbidden_Returns403()
    {
        // Arrange
        var service = new Mock<IAnnouncementsService>();
        service.Setup(svc => svc.RetireAsync(AnnouncementId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AnnouncementMutationResult(AnnouncementMutationOutcome.Forbidden, null));

        // Act
        var result = await Build(service).Retire(AnnouncementId, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Query_CancellationPropagates()
    {
        // Arrange
        var service = new Mock<IAnnouncementsService>();
        service.Setup(svc => svc.QueryAsync(UserId, It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(service).Query(new AnnouncementQuery(), cts.Token));
    }

    [Fact]
    public async Task Create_ScheduledWithoutDate_Returns400()
    {
        // Arrange — a Scheduled post must carry a publish time.
        var service = new Mock<IAnnouncementsService>();
        var request = new AnnouncementCreateRequest { Title = "T", Body = "B", Audience = Everyone, Status = "Scheduled" };

        // Act
        var result = await Build(service, AdminGuard(true)).Create(WorkspaceId, request, CancellationToken.None);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result);
        service.Verify(svc => svc.CreateAsync(It.IsAny<Guid>(), It.IsAny<AnnouncementCreateRequest>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Create_UnknownStatus_Returns400()
    {
        // Arrange — status must be Active or Scheduled.
        var service = new Mock<IAnnouncementsService>();
        var request = new AnnouncementCreateRequest { Title = "T", Body = "B", Audience = Everyone, Status = "Whenever" };

        // Act
        var result = await Build(service, AdminGuard(true)).Create(WorkspaceId, request, CancellationToken.None);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Create_ChosenAuthorNotMember_Returns400()
    {
        // Arrange — admin posts "on behalf of" someone who is not a workspace member.
        var stranger = Guid.NewGuid();
        var service = new Mock<IAnnouncementsService>();
        var guard = AdminGuard(true); // actor is admin; the stranger's Viewer check defaults to false.
        var request = new AnnouncementCreateRequest { Title = "T", Body = "B", Audience = Everyone, Author = stranger };

        // Act
        var result = await Build(service, guard).Create(WorkspaceId, request, CancellationToken.None);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result);
        service.Verify(svc => svc.CreateAsync(It.IsAny<Guid>(), It.IsAny<AnnouncementCreateRequest>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Update_InvalidAuthor_Returns400()
    {
        // Arrange — the service reports the chosen poster is not a member of the row's workspace.
        var service = new Mock<IAnnouncementsService>();
        service.Setup(svc => svc.UpdateAsync(AnnouncementId, It.IsAny<AnnouncementPatchRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AnnouncementMutationResult(AnnouncementMutationOutcome.InvalidAuthor, null));
        var request = new AnnouncementPatchRequest { Title = "T", Body = "B", Audience = Everyone };

        // Act
        var result = await Build(service).Update(AnnouncementId, request, CancellationToken.None);

        // Assert
        Assert.IsType<BadRequestObjectResult>(result);
    }
}

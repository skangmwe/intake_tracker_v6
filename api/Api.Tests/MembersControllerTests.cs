// Unit tests for MembersController — routing, WorkspaceAdmin access mapping, and status-code
// mapping only (the service and access guard are mocked). Covers happy paths, each upsert outcome
// (Member 200 / Invited 200 / Ambiguous 400 / AlreadyInvited 409), the cancel-invitation outcomes
// (204 / 403), the deactivate outcomes (204 / 409), the access-denied (403 never 404) branches, and
// cancellation-token propagation (api-testing-guidelines.md).

using McDermott.AiTracker.Api.Modules.Users;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class MembersControllerTests
{
    private static readonly Guid WorkspaceId = Guid.NewGuid();
    private static readonly Guid ActorId = Guid.NewGuid();
    private static readonly Guid TargetId = Guid.NewGuid();
    private static readonly Guid InvitationId = Guid.NewGuid();

    private static MembersController Build(Mock<IMembersService> members, bool isAdmin = true)
    {
        var accessGuard = new Mock<IAccessGuard>();
        accessGuard
            .Setup(guard => guard.HasWorkspaceLevelAsync(ActorId, WorkspaceId, WorkspaceLevel.WorkspaceAdmin, It.IsAny<CancellationToken>()))
            .ReturnsAsync(isAdmin);

        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(ActorId);

        var httpContext = new DefaultHttpContext();
        httpContext.Items[OperationIdMiddleware.HeaderName] = "op-123";

        return new MembersController(members.Object, accessGuard.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };
    }

    private static MembershipUpsertRequest AddByEmail() => new() { Email = "priya@example.com", Level = "Member" };

    [Fact]
    public async Task ListMembers_AdminCanRead_ReturnsOk()
    {
        // Arrange — the list can hold a real member and a pending invitation row.
        var list = new MembersListDto(new[]
        {
            new WorkspaceMemberDto(TargetId, "Priya Raman", "priya@example.com", "Member", false, DateTime.UtcNow, "Active", null),
            new WorkspaceMemberDto(null, null, "newcomer@example.com", "Viewer", false, null, "Invited", InvitationId),
        });
        var members = new Mock<IMembersService>();
        members.Setup(service => service.ListAsync(WorkspaceId, It.IsAny<CancellationToken>())).ReturnsAsync(list);

        // Act
        var result = await Build(members).ListMembers(WorkspaceId, CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Same(list, ok.Value);
    }

    [Fact]
    public async Task ListMembers_NotAdmin_Returns403()
    {
        // Arrange
        var members = new Mock<IMembersService>();

        // Act
        var result = await Build(members, isAdmin: false).ListMembers(WorkspaceId, CancellationToken.None);

        // Assert — ownership violation is 403, never 404 (api-error-handling.md).
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task UpsertMember_Member_Returns200WithMemberOutcome()
    {
        // Arrange — a known platform user joins now.
        var members = new Mock<IMembersService>();
        members
            .Setup(service => service.UpsertAsync(WorkspaceId, It.IsAny<MembershipUpsertRequest>(), ActorId, "op-123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new MembershipUpsertResult(MembershipUpsertOutcome.Member, TargetId, WasAdded: true));

        // Act
        var result = await Build(members).UpsertMember(WorkspaceId, AddByEmail(), CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<MembershipUpsertResponse>(ok.Value);
        Assert.Equal("Member", response.Outcome);
    }

    [Fact]
    public async Task UpsertMember_Invited_Returns200WithInvitedOutcome()
    {
        // Arrange — an unknown email becomes a pending invitation.
        var members = new Mock<IMembersService>();
        members
            .Setup(service => service.UpsertAsync(WorkspaceId, It.IsAny<MembershipUpsertRequest>(), ActorId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new MembershipUpsertResult(MembershipUpsertOutcome.Invited));

        // Act
        var result = await Build(members).UpsertMember(WorkspaceId, AddByEmail(), CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<MembershipUpsertResponse>(ok.Value);
        Assert.Equal("Invited", response.Outcome);
    }

    [Fact]
    public async Task UpsertMember_Ambiguous_Returns400()
    {
        // Arrange
        var members = new Mock<IMembersService>();
        members
            .Setup(service => service.UpsertAsync(WorkspaceId, It.IsAny<MembershipUpsertRequest>(), ActorId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new MembershipUpsertResult(MembershipUpsertOutcome.Ambiguous));

        // Act
        var result = await Build(members).UpsertMember(WorkspaceId, AddByEmail(), CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
    }

    [Fact]
    public async Task UpsertMember_AlreadyInvited_Returns409()
    {
        // Arrange — the email already has a live pending invitation.
        var members = new Mock<IMembersService>();
        members
            .Setup(service => service.UpsertAsync(WorkspaceId, It.IsAny<MembershipUpsertRequest>(), ActorId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new MembershipUpsertResult(MembershipUpsertOutcome.AlreadyInvited));

        // Act
        var result = await Build(members).UpsertMember(WorkspaceId, AddByEmail(), CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, problem.StatusCode);
    }

    [Fact]
    public async Task UpsertMember_NotAdmin_Returns403()
    {
        var members = new Mock<IMembersService>();
        var result = await Build(members, isAdmin: false).UpsertMember(WorkspaceId, AddByEmail(), CancellationToken.None);
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task CancelInvitation_Cancelled_Returns204()
    {
        // Arrange
        var members = new Mock<IMembersService>();
        members
            .Setup(service => service.CancelInvitationAsync(WorkspaceId, InvitationId, ActorId, "op-123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CancelInvitationResult(CancelInvitationOutcome.Cancelled));

        // Act
        var result = await Build(members).CancelInvitation(WorkspaceId, InvitationId, CancellationToken.None);

        // Assert
        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task CancelInvitation_NotFound_Returns403()
    {
        // Arrange — a missing / other-workspace invite is 403, never 404 (never disclose existence).
        var members = new Mock<IMembersService>();
        members
            .Setup(service => service.CancelInvitationAsync(WorkspaceId, InvitationId, ActorId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CancelInvitationResult(CancelInvitationOutcome.NotFound));

        // Act
        var result = await Build(members).CancelInvitation(WorkspaceId, InvitationId, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task CancelInvitation_NotAdmin_Returns403()
    {
        var members = new Mock<IMembersService>();
        var result = await Build(members, isAdmin: false).CancelInvitation(WorkspaceId, InvitationId, CancellationToken.None);
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task DeactivateMember_Success_Returns204()
    {
        // Arrange
        var members = new Mock<IMembersService>();
        members
            .Setup(service => service.DeactivateAsync(WorkspaceId, TargetId, ActorId, "op-123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new DeactivateMemberResult(DeactivateMemberOutcome.Success));

        // Act
        var result = await Build(members).DeactivateMember(WorkspaceId, TargetId, CancellationToken.None);

        // Assert
        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task DeactivateMember_Blocked_Returns409()
    {
        // Arrange — a pending named-individual sign-off blocks deactivation (BS §6.8).
        var members = new Mock<IMembersService>();
        members
            .Setup(service => service.DeactivateAsync(WorkspaceId, TargetId, ActorId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new DeactivateMemberResult(DeactivateMemberOutcome.Blocked));

        // Act
        var result = await Build(members).DeactivateMember(WorkspaceId, TargetId, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, problem.StatusCode);
    }

    [Fact]
    public async Task DeactivateMember_NotAdmin_Returns403()
    {
        var members = new Mock<IMembersService>();
        var result = await Build(members, isAdmin: false).DeactivateMember(WorkspaceId, TargetId, CancellationToken.None);
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task SetSuspension_Success_Returns204(bool suspended)
    {
        // Arrange
        var members = new Mock<IMembersService>();
        members
            .Setup(service => service.SetSuspensionAsync(WorkspaceId, TargetId, suspended, ActorId, "op-123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SetSuspensionResult(SetSuspensionOutcome.Success));

        // Act
        var result = await Build(members).SetSuspension(
            WorkspaceId, TargetId, new MemberSuspensionRequest { Suspended = suspended }, CancellationToken.None);

        // Assert
        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task SetSuspension_Blocked_Returns409()
    {
        // Arrange — suspending a user with a pending named-individual sign-off is blocked (BS §6.8).
        var members = new Mock<IMembersService>();
        members
            .Setup(service => service.SetSuspensionAsync(WorkspaceId, TargetId, true, ActorId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SetSuspensionResult(SetSuspensionOutcome.Blocked));

        // Act
        var result = await Build(members).SetSuspension(
            WorkspaceId, TargetId, new MemberSuspensionRequest { Suspended = true }, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, problem.StatusCode);
    }

    [Fact]
    public async Task SetSuspension_NotAdmin_Returns403()
    {
        var members = new Mock<IMembersService>();
        var result = await Build(members, isAdmin: false).SetSuspension(
            WorkspaceId, TargetId, new MemberSuspensionRequest { Suspended = true }, CancellationToken.None);
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task UpsertMember_CancellationPropagates()
    {
        // Arrange — a cancelled token surfaces as an OperationCanceledException, not a swallowed result.
        var members = new Mock<IMembersService>();
        members
            .Setup(service => service.UpsertAsync(WorkspaceId, It.IsAny<MembershipUpsertRequest>(), ActorId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(members).UpsertMember(WorkspaceId, AddByEmail(), cts.Token));
    }
}

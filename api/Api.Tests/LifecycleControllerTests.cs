// Unit tests for LifecycleController — routing, access mapping, and status-code mapping only
// (the service and access guard are mocked). Covers happy paths, each save/add outcome, the
// access-denied (403 never 404) branches, and cancellation-token propagation
// (api-testing-guidelines.md).

using McDermott.AiTracker.Api.Modules.Lifecycle;
using McDermott.AiTracker.Api.Modules.PlatformAdmin;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class LifecycleControllerTests
{
    private static readonly Guid WorkspaceId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    private static LifecycleController Build(
        Mock<ILifecycleService> lifecycle,
        bool isViewer = true,
        bool isAdmin = true,
        Mock<IRoleLabelsService>? roleLabels = null)
    {
        var accessGuard = new Mock<IAccessGuard>();
        accessGuard.Setup(guard => guard.HasWorkspaceLevelAsync(UserId, WorkspaceId, WorkspaceLevel.Viewer, It.IsAny<CancellationToken>())).ReturnsAsync(isViewer);
        accessGuard.Setup(guard => guard.HasWorkspaceLevelAsync(UserId, WorkspaceId, WorkspaceLevel.WorkspaceAdmin, It.IsAny<CancellationToken>())).ReturnsAsync(isAdmin);

        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        var httpContext = new DefaultHttpContext();
        httpContext.Items[OperationIdMiddleware.HeaderName] = "op-123";

        return new LifecycleController(
            lifecycle.Object, (roleLabels ?? new Mock<IRoleLabelsService>()).Object, accessGuard.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };
    }

    private static LifecycleConfigDto SampleConfig() => new(
        WorkspaceId,
        Array.Empty<LifecycleDto>(),
        new[] { "InfoSec" },
        Array.Empty<ApproverTeamDto>());

    private static LifecycleConfigUpdateRequest SampleRequest() => new()
    {
        Lifecycles = new[]
        {
            new LifecycleUpsertInput { Name = "Standard", RequestType = "Full build", IsDefault = true, SortOrder = 0 },
        },
    };

    [Fact]
    public async Task GetLifecycle_ViewerCanRead_ReturnsOk()
    {
        // Arrange
        var config = SampleConfig();
        var lifecycle = new Mock<ILifecycleService>();
        lifecycle.Setup(service => service.GetConfigAsync(WorkspaceId, It.IsAny<CancellationToken>())).ReturnsAsync(config);

        // Act
        var result = await Build(lifecycle).GetLifecycle(WorkspaceId, CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Same(config, ok.Value);
    }

    [Fact]
    public async Task GetLifecycle_NoMembership_Returns403()
    {
        // Arrange
        var lifecycle = new Mock<ILifecycleService>();

        // Act
        var result = await Build(lifecycle, isViewer: false).GetLifecycle(WorkspaceId, CancellationToken.None);

        // Assert — ownership violation is 403, never 404 (api-error-handling.md).
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task GetLifecycles_ViewerCanRead_ReturnsOk()
    {
        // Arrange
        var summaries = new[] { new LifecycleSummaryDto(Guid.NewGuid(), "Standard", true) };
        var lifecycle = new Mock<ILifecycleService>();
        lifecycle.Setup(service => service.GetSummariesAsync(WorkspaceId, It.IsAny<CancellationToken>())).ReturnsAsync(summaries);

        // Act
        var result = await Build(lifecycle).GetLifecycles(WorkspaceId, CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Same(summaries, ok.Value);
    }

    [Fact]
    public async Task GetLifecycles_NoMembership_Returns403()
    {
        // Arrange
        var lifecycle = new Mock<ILifecycleService>();

        // Act
        var result = await Build(lifecycle, isViewer: false).GetLifecycles(WorkspaceId, CancellationToken.None);

        // Assert — ownership violation is 403, never 404 (api-error-handling.md).
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task SaveLifecycle_Success_ReturnsOk()
    {
        // Arrange
        var config = SampleConfig();
        var lifecycle = new Mock<ILifecycleService>();
        lifecycle.Setup(service => service.SaveConfigAsync(WorkspaceId, It.IsAny<LifecycleConfigUpdateRequest>(), UserId, "op-123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new LifecycleSaveResult(LifecycleSaveOutcome.Success, config));

        // Act
        var result = await Build(lifecycle).SaveLifecycle(WorkspaceId, SampleRequest(), CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Same(config, ok.Value);
    }

    [Fact]
    public async Task SaveLifecycle_Invalid_Returns400()
    {
        // Arrange
        var lifecycle = new Mock<ILifecycleService>();
        lifecycle.Setup(service => service.SaveConfigAsync(WorkspaceId, It.IsAny<LifecycleConfigUpdateRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new LifecycleSaveResult(LifecycleSaveOutcome.Invalid, Errors: new[] { "Exactly one lifecycle must be marked as the default." }));

        // Act
        var result = await Build(lifecycle).SaveLifecycle(WorkspaceId, SampleRequest(), CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
    }

    [Fact]
    public async Task SaveLifecycle_NotAdmin_Returns403()
    {
        var lifecycle = new Mock<ILifecycleService>();
        var result = await Build(lifecycle, isAdmin: false).SaveLifecycle(WorkspaceId, SampleRequest(), CancellationToken.None);
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task GetApproverTeams_ViewerCanRead_ReturnsOk()
    {
        var lifecycle = new Mock<ILifecycleService>();
        lifecycle.Setup(service => service.GetApproverTeamsAsync(WorkspaceId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<ApproverTeamDto>());

        var result = await Build(lifecycle).GetApproverTeams(WorkspaceId, CancellationToken.None);
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task AddApproverMember_Success_Returns201()
    {
        var member = new ApproverTeamMemberDto(Guid.NewGuid(), "Priya Raman");
        var lifecycle = new Mock<ILifecycleService>();
        lifecycle.Setup(service => service.AddApproverMemberAsync(WorkspaceId, "InfoSec", "Priya Raman", UserId, "op-123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AddMemberResult(AddMemberOutcome.Success, member));

        var request = new ApproverTeamAddRequest { RoleLabel = "InfoSec", Person = "Priya Raman" };
        var result = await Build(lifecycle).AddApproverMember(WorkspaceId, request, CancellationToken.None);

        var created = Assert.IsType<CreatedResult>(result);
        Assert.Same(member, created.Value);
    }

    [Fact]
    public async Task AddApproverMember_Unresolved_Returns400()
    {
        var lifecycle = new Mock<ILifecycleService>();
        lifecycle.Setup(service => service.AddApproverMemberAsync(WorkspaceId, "InfoSec", "Nobody", UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AddMemberResult(AddMemberOutcome.Unresolved));

        var request = new ApproverTeamAddRequest { RoleLabel = "InfoSec", Person = "Nobody" };
        var result = await Build(lifecycle).AddApproverMember(WorkspaceId, request, CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
    }

    [Fact]
    public async Task AddApproverMember_Ambiguous_Returns400()
    {
        var lifecycle = new Mock<ILifecycleService>();
        lifecycle.Setup(service => service.AddApproverMemberAsync(WorkspaceId, "GCO", "Sam Lee", UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AddMemberResult(AddMemberOutcome.Ambiguous));

        var request = new ApproverTeamAddRequest { RoleLabel = "GCO", Person = "Sam Lee" };
        var result = await Build(lifecycle).AddApproverMember(WorkspaceId, request, CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
    }

    [Fact]
    public async Task AddApproverMember_NotAdmin_Returns403()
    {
        var lifecycle = new Mock<ILifecycleService>();
        var request = new ApproverTeamAddRequest { RoleLabel = "InfoSec", Person = "Priya Raman" };
        var result = await Build(lifecycle, isAdmin: false).AddApproverMember(WorkspaceId, request, CancellationToken.None);
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task RemoveApproverMember_Success_Returns204()
    {
        var lifecycle = new Mock<ILifecycleService>();
        var request = new ApproverTeamRemoveRequest { RoleLabel = "InfoSec", UserId = Guid.NewGuid() };

        var result = await Build(lifecycle).RemoveApproverMember(WorkspaceId, request, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        lifecycle.Verify(service => service.RemoveApproverMemberAsync(
            WorkspaceId, "InfoSec", request.UserId, UserId, "op-123", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task RemoveApproverMember_NotAdmin_Returns403()
    {
        var lifecycle = new Mock<ILifecycleService>();
        var request = new ApproverTeamRemoveRequest { RoleLabel = "InfoSec", UserId = Guid.NewGuid() };
        var result = await Build(lifecycle, isAdmin: false).RemoveApproverMember(WorkspaceId, request, CancellationToken.None);
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    // ─── Team lifecycle (create / rename / delete a role label) ─────────────────

    [Fact]
    public async Task CreateApproverTeam_Success_Returns201()
    {
        // Arrange
        var roleLabels = new Mock<IRoleLabelsService>();
        var created = new RoleLabelResponse(Guid.NewGuid(), "Model Risk", 3);
        roleLabels.Setup(service => service.CreateAsync("Model Risk", UserId, "op-123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new RoleLabelWriteResult(RoleLabelWriteOutcome.Success, created));

        // Act
        var result = await Build(new Mock<ILifecycleService>(), roleLabels: roleLabels)
            .CreateApproverTeam(WorkspaceId, new RoleLabelCreateRequest { Label = "Model Risk" }, CancellationToken.None);

        // Assert
        var response = Assert.IsType<CreatedResult>(result);
        Assert.Same(created, response.Value);
    }

    [Fact]
    public async Task CreateApproverTeam_Duplicate_Returns409()
    {
        // Arrange
        var roleLabels = new Mock<IRoleLabelsService>();
        roleLabels.Setup(service => service.CreateAsync(It.IsAny<string>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new RoleLabelWriteResult(RoleLabelWriteOutcome.Duplicate));

        // Act
        var result = await Build(new Mock<ILifecycleService>(), roleLabels: roleLabels)
            .CreateApproverTeam(WorkspaceId, new RoleLabelCreateRequest { Label = "GCO" }, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, problem.StatusCode);
    }

    [Fact]
    public async Task CreateApproverTeam_Blank_Returns400()
    {
        // Arrange
        var roleLabels = new Mock<IRoleLabelsService>();
        roleLabels.Setup(service => service.CreateAsync(It.IsAny<string>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new RoleLabelWriteResult(RoleLabelWriteOutcome.Blank));

        // Act
        var result = await Build(new Mock<ILifecycleService>(), roleLabels: roleLabels)
            .CreateApproverTeam(WorkspaceId, new RoleLabelCreateRequest { Label = " " }, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
    }

    [Fact]
    public async Task CreateApproverTeam_NotAdmin_Returns403()
    {
        // Arrange
        var roleLabels = new Mock<IRoleLabelsService>();

        // Act
        var result = await Build(new Mock<ILifecycleService>(), isAdmin: false, roleLabels: roleLabels)
            .CreateApproverTeam(WorkspaceId, new RoleLabelCreateRequest { Label = "Model Risk" }, CancellationToken.None);

        // Assert — the write is never attempted when access is denied.
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        roleLabels.Verify(service => service.CreateAsync(It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task RenameApproverTeam_Success_ReturnsOk()
    {
        // Arrange
        var roleLabelId = Guid.NewGuid();
        var roleLabels = new Mock<IRoleLabelsService>();
        var renamed = new RoleLabelResponse(roleLabelId, "Contracts", 1);
        roleLabels.Setup(service => service.RenameAsync(roleLabelId, "Contracts", UserId, "op-123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new RoleLabelWriteResult(RoleLabelWriteOutcome.Success, renamed));

        // Act
        var result = await Build(new Mock<ILifecycleService>(), roleLabels: roleLabels)
            .RenameApproverTeam(WorkspaceId, roleLabelId, new RoleLabelRenameRequest { Label = "Contracts" }, CancellationToken.None);

        // Assert
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Same(renamed, ok.Value);
    }

    [Fact]
    public async Task RenameApproverTeam_NotFound_Returns404()
    {
        // Arrange
        var roleLabels = new Mock<IRoleLabelsService>();
        roleLabels.Setup(service => service.RenameAsync(It.IsAny<Guid>(), It.IsAny<string>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new RoleLabelWriteResult(RoleLabelWriteOutcome.NotFound));

        // Act
        var result = await Build(new Mock<ILifecycleService>(), roleLabels: roleLabels)
            .RenameApproverTeam(WorkspaceId, Guid.NewGuid(), new RoleLabelRenameRequest { Label = "Contracts" }, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status404NotFound, problem.StatusCode);
    }

    [Fact]
    public async Task RenameApproverTeam_NotAdmin_Returns403()
    {
        // Arrange
        var roleLabels = new Mock<IRoleLabelsService>();

        // Act
        var result = await Build(new Mock<ILifecycleService>(), isAdmin: false, roleLabels: roleLabels)
            .RenameApproverTeam(WorkspaceId, Guid.NewGuid(), new RoleLabelRenameRequest { Label = "Contracts" }, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        roleLabels.Verify(service => service.RenameAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task DeleteApproverTeam_Success_Returns204()
    {
        // Arrange
        var roleLabelId = Guid.NewGuid();
        var roleLabels = new Mock<IRoleLabelsService>();

        // Act
        var result = await Build(new Mock<ILifecycleService>(), roleLabels: roleLabels)
            .DeleteApproverTeam(WorkspaceId, roleLabelId, CancellationToken.None);

        // Assert
        Assert.IsType<NoContentResult>(result);
        roleLabels.Verify(service => service.RetireAsync(roleLabelId, UserId, "op-123", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task DeleteApproverTeam_NotAdmin_Returns403()
    {
        // Arrange
        var roleLabels = new Mock<IRoleLabelsService>();

        // Act
        var result = await Build(new Mock<ILifecycleService>(), isAdmin: false, roleLabels: roleLabels)
            .DeleteApproverTeam(WorkspaceId, Guid.NewGuid(), CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        roleLabels.Verify(service => service.RetireAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task SaveLifecycle_CancellationPropagates()
    {
        // Arrange — a cancelled token surfaces as an OperationCanceledException, not a swallowed result.
        var lifecycle = new Mock<ILifecycleService>();
        lifecycle.Setup(service => service.SaveConfigAsync(WorkspaceId, It.IsAny<LifecycleConfigUpdateRequest>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(lifecycle).SaveLifecycle(WorkspaceId, SampleRequest(), cts.Token));
    }
}

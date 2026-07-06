// Unit tests for AuditController (routing / authorization / status-code mapping — the service is
// mocked). Covers: WorkspaceAdmin happy path (200 + page), non-admin (403, service never called),
// page-size-over-100 rejection (400, checked before the access gate so an over-size request is
// rejected regardless of role, service never called), and cancellation propagation
// (api-testing-guidelines.md). The audit-content access itself (workspace scoping) is exercised by
// the tSQLt proc tests.

using McDermott.AiTracker.Api.Modules.Audit;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class AuditControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid WorkspaceId = Guid.NewGuid();

    private static AuditController Build(Mock<IAuditService> audit, Mock<IAccessGuard> accessGuard)
    {
        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        return new AuditController(audit.Object, accessGuard.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
    }

    private static Mock<IAccessGuard> AdminGuard(bool isAdmin)
    {
        var guard = new Mock<IAccessGuard>();
        guard.Setup(g => g.HasWorkspaceLevelAsync(
                UserId, WorkspaceId, WorkspaceLevel.WorkspaceAdmin, It.IsAny<CancellationToken>()))
            .ReturnsAsync(isAdmin);
        return guard;
    }

    private static AuditLogQueryRequest ValidRequest() => new() { Page = 1, PageSize = 20 };

    [Fact]
    public async Task QueryWorkspaceAudit_Admin_ReturnsOkWithPage()
    {
        // Arrange
        var page = new PaginatedResponse<AuditLogRowResponse>(
            new List<AuditLogRowResponse>
            {
                new(Guid.NewGuid(), WorkspaceId, "AIS-00000001", "Request", "request.created",
                    UserId, "Ada Analyst", DateTime.UtcNow, "{}"),
            },
            1, 1, 20);
        var audit = new Mock<IAuditService>();
        audit.Setup(service => service.QueryWorkspaceAuditAsync(
                WorkspaceId, It.IsAny<AuditLogQueryRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(page);

        // Act
        var result = await Build(audit, AdminGuard(true))
            .QueryWorkspaceAudit(WorkspaceId, ValidRequest(), CancellationToken.None);

        // Assert
        Assert.Same(page, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Fact]
    public async Task QueryWorkspaceAudit_NonAdmin_Returns403AndDoesNotCallService()
    {
        // Arrange
        var audit = new Mock<IAuditService>();

        // Act
        var result = await Build(audit, AdminGuard(false))
            .QueryWorkspaceAudit(WorkspaceId, ValidRequest(), CancellationToken.None);

        // Assert — 403 (never 404), service never touched.
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        audit.Verify(
            service => service.QueryWorkspaceAuditAsync(
                It.IsAny<Guid>(), It.IsAny<AuditLogQueryRequest>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task QueryWorkspaceAudit_PageSizeOverMax_Returns400AndDoesNotCallService()
    {
        // Arrange — even for an admin, over-100 is rejected at the boundary (never clamped).
        var audit = new Mock<IAuditService>();
        var request = new AuditLogQueryRequest { Page = 1, PageSize = 101 };

        // Act
        var result = await Build(audit, AdminGuard(true))
            .QueryWorkspaceAudit(WorkspaceId, request, CancellationToken.None);

        // Assert
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
        audit.Verify(
            service => service.QueryWorkspaceAuditAsync(
                It.IsAny<Guid>(), It.IsAny<AuditLogQueryRequest>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task QueryWorkspaceAudit_CancellationPropagates()
    {
        // Arrange
        var audit = new Mock<IAuditService>();
        audit.Setup(service => service.QueryWorkspaceAuditAsync(
                It.IsAny<Guid>(), It.IsAny<AuditLogQueryRequest>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(audit, AdminGuard(true)).QueryWorkspaceAudit(WorkspaceId, ValidRequest(), cts.Token));
    }
}

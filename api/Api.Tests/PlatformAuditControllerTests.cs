// Unit tests for PlatformAuditController (S39) — the Platform-admin gate, pagination ceiling, and read
// (service + guard mocked). Covers happy path, over-100 400, non-admin 403, and cancellation.

using McDermott.AiTracker.Api.Modules.PlatformAdmin;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class PlatformAuditControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();

    private static PlatformAuditController Build(Mock<IFirmWideAuditService> service, bool isPlatformAdmin)
    {
        var accessGuard = new Mock<IAccessGuard>();
        accessGuard.Setup(guard => guard.IsPlatformAdminAsync(UserId, It.IsAny<CancellationToken>())).ReturnsAsync(isPlatformAdmin);

        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        return new PlatformAuditController(service.Object, accessGuard.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
    }

    private static PaginatedResponse<FirmWideAuditRowResponse> EmptyPage() =>
        new(Array.Empty<FirmWideAuditRowResponse>(), 0, 1, 20);

    [Fact]
    public async Task QueryFirmWideAudit_Admin_ReturnsOk()
    {
        var service = new Mock<IFirmWideAuditService>();
        service.Setup(candidate => candidate.QueryAsync(It.IsAny<FirmWideAuditQueryRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(EmptyPage());

        var result = await Build(service, isPlatformAdmin: true)
            .QueryFirmWideAudit(new FirmWideAuditQueryRequest { Page = 1, PageSize = 20 }, CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task QueryFirmWideAudit_OverMaxPageSize_Returns400_BeforeAccessCheck()
    {
        var service = new Mock<IFirmWideAuditService>();

        var result = await Build(service, isPlatformAdmin: true)
            .QueryFirmWideAudit(new FirmWideAuditQueryRequest { Page = 1, PageSize = 101 }, CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
        service.Verify(candidate => candidate.QueryAsync(It.IsAny<FirmWideAuditQueryRequest>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task QueryFirmWideAudit_NotAdmin_Returns403()
    {
        var service = new Mock<IFirmWideAuditService>();

        var result = await Build(service, isPlatformAdmin: false)
            .QueryFirmWideAudit(new FirmWideAuditQueryRequest { Page = 1, PageSize = 20 }, CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        service.Verify(candidate => candidate.QueryAsync(It.IsAny<FirmWideAuditQueryRequest>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task QueryFirmWideAudit_CancellationPropagates()
    {
        var service = new Mock<IFirmWideAuditService>();
        service.Setup(candidate => candidate.QueryAsync(It.IsAny<FirmWideAuditQueryRequest>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(service, isPlatformAdmin: true).QueryFirmWideAudit(new FirmWideAuditQueryRequest { Page = 1, PageSize = 20 }, cts.Token));
    }
}

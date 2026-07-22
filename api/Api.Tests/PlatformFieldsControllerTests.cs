// Unit tests for PlatformFieldsController (S34) — the Platform-admin gate and status mapping
// (the service and access guard are mocked). Covers happy path, non-admin 403, the not-found and
// system-immutable branches, and cancellation propagation.

using McDermott.AiTracker.Api.Modules.Fields;
using McDermott.AiTracker.Api.Modules.PlatformAdmin;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class PlatformFieldsControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();

    private static PlatformFieldsController Build(
        Mock<IPlatformFieldService> service, bool isPlatformAdmin, Mock<IFieldSchemaService>? fieldSchema = null)
    {
        var accessGuard = new Mock<IAccessGuard>();
        accessGuard.Setup(guard => guard.IsPlatformAdminAsync(UserId, It.IsAny<CancellationToken>())).ReturnsAsync(isPlatformAdmin);

        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);

        var httpContext = new DefaultHttpContext();
        httpContext.Items[OperationIdMiddleware.HeaderName] = "op-abc";

        return new PlatformFieldsController(
            service.Object, (fieldSchema ?? new Mock<IFieldSchemaService>()).Object, accessGuard.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };
    }

    private static PlatformFieldDto SampleField(string key = "legacy-id") =>
        new(Guid.NewGuid(), key, "Legacy ID", "Text", "Platform", IsSystemImmutable: false, HasManualWritePath: true, SelectOptions: null);

    [Fact]
    public async Task GetPlatformFields_Admin_ReturnsOk()
    {
        // Arrange
        var service = new Mock<IPlatformFieldService>();
        service.Setup(candidate => candidate.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { SampleField() });

        // Act
        var result = await Build(service, isPlatformAdmin: true).GetPlatformFields(CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task GetPlatformFields_NotAdmin_Returns403()
    {
        var service = new Mock<IPlatformFieldService>();
        var result = await Build(service, isPlatformAdmin: false).GetPlatformFields(CancellationToken.None);
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task GetPlatformFieldCatalog_Admin_ReturnsOk()
    {
        // Arrange
        var service = new Mock<IPlatformFieldService>();
        var fieldSchema = new Mock<IFieldSchemaService>();
        fieldSchema.Setup(candidate => candidate.GetPlatformCatalogAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PlatformFieldCatalogDto(Array.Empty<FieldCatalogRowDto>()));

        // Act
        var result = await Build(service, isPlatformAdmin: true, fieldSchema).GetPlatformFieldCatalog(CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
        fieldSchema.Verify(candidate => candidate.GetPlatformCatalogAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task GetPlatformFieldCatalog_NotAdmin_Returns403()
    {
        var service = new Mock<IPlatformFieldService>();
        var fieldSchema = new Mock<IFieldSchemaService>();

        var result = await Build(service, isPlatformAdmin: false, fieldSchema).GetPlatformFieldCatalog(CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
        fieldSchema.Verify(candidate => candidate.GetPlatformCatalogAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task UpdatePlatformField_Success_ReturnsOk()
    {
        // Arrange
        var service = new Mock<IPlatformFieldService>();
        service.Setup(candidate => candidate.UpdateAsync("legacy-id", "Legacy Identifier", null, UserId, "op-abc", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PlatformFieldResult(PlatformFieldOutcome.Success, SampleField()));
        var request = new PlatformFieldPatchRequest { DisplayName = "Legacy Identifier" };

        // Act
        var result = await Build(service, isPlatformAdmin: true).UpdatePlatformField("legacy-id", request, CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task UpdatePlatformField_SystemImmutable_Returns403()
    {
        var service = new Mock<IPlatformFieldService>();
        service.Setup(candidate => candidate.UpdateAsync("record-id", It.IsAny<string>(), It.IsAny<IReadOnlyList<string>?>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PlatformFieldResult(PlatformFieldOutcome.SystemImmutable));
        var request = new PlatformFieldPatchRequest { DisplayName = "Nope" };

        var result = await Build(service, isPlatformAdmin: true).UpdatePlatformField("record-id", request, CancellationToken.None);
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    }

    [Fact]
    public async Task UpdatePlatformField_NotFound_Returns404()
    {
        var service = new Mock<IPlatformFieldService>();
        service.Setup(candidate => candidate.UpdateAsync("ghost", It.IsAny<string>(), It.IsAny<IReadOnlyList<string>?>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PlatformFieldResult(PlatformFieldOutcome.NotFound));
        var request = new PlatformFieldPatchRequest { DisplayName = "X" };

        var result = await Build(service, isPlatformAdmin: true).UpdatePlatformField("ghost", request, CancellationToken.None);
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task UpdatePlatformField_CancellationPropagates()
    {
        var service = new Mock<IPlatformFieldService>();
        service.Setup(candidate => candidate.UpdateAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<IReadOnlyList<string>?>(), UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();
        var request = new PlatformFieldPatchRequest { DisplayName = "X" };

        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(service, isPlatformAdmin: true).UpdatePlatformField("legacy-id", request, cts.Token));
    }
}

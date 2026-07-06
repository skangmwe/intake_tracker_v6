// Unit tests for SavedViewsController (routing / access gate / status-code mapping — the service and
// access guard are mocked). Covers the Viewer+ gate on list (403), create/update/delete outcome
// mapping (Success→201/200/204, NotFound→404, Denied→403), and cancellation propagation
// (api-testing-guidelines.md). DB-backed behaviours (visibility, default clearing, soft delete) are
// covered by tSQLt; the personal/shared authorization is unit-tested at the service level indirectly
// via the outcome the controller maps here.

using System.Text.Json;
using McDermott.AiTracker.Api.Modules.SavedViews;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class SavedViewsControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid WorkspaceId = Guid.NewGuid();
    private static readonly Guid SavedViewId = Guid.NewGuid();

    private static SavedViewResponse Sample() => new(
        SavedViewId, WorkspaceId, "Request", "My view", "personal", false,
        Array.Empty<string>(), new Dictionary<string, JsonElement>(), Array.Empty<SavedViewSortEntry>(),
        UserId, "creator", DateTime.UtcNow, DateTime.UtcNow);

    private static SavedViewUpsertRequest Body(string scope = "personal") => new()
    {
        ObjectType = "Request",
        Name = "My view",
        Scope = scope,
        Columns = new[] { "name" },
    };

    private static SavedViewsController Build(Mock<ISavedViewsService> service, Mock<IAccessGuard>? guard = null)
    {
        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);
        return new SavedViewsController(service.Object, (guard ?? ViewerGuard(true)).Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
    }

    private static Mock<IAccessGuard> ViewerGuard(bool isMember)
    {
        var guard = new Mock<IAccessGuard>();
        guard.Setup(check => check.HasWorkspaceLevelAsync(UserId, WorkspaceId, WorkspaceLevel.Viewer, It.IsAny<CancellationToken>()))
            .ReturnsAsync(isMember);
        return guard;
    }

    [Fact]
    public async Task List_Member_ReturnsOk()
    {
        // Arrange
        var service = new Mock<ISavedViewsService>();
        service.Setup(svc => svc.ListAsync(WorkspaceId, "Request", UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Sample() });

        // Act
        var result = await Build(service).ListSavedViews(WorkspaceId, "Request", CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task List_NonMember_Returns403()
    {
        // Arrange
        var service = new Mock<ISavedViewsService>();

        // Act
        var result = await Build(service, ViewerGuard(false)).ListSavedViews(WorkspaceId, "Request", CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
        service.Verify(svc => svc.ListAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task List_DefaultsObjectTypeToRequest()
    {
        // Arrange — a missing objectType falls back to the Request surface.
        var service = new Mock<ISavedViewsService>();
        service.Setup(svc => svc.ListAsync(WorkspaceId, "Request", UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<SavedViewResponse>());

        // Act
        var result = await Build(service).ListSavedViews(WorkspaceId, null, CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
        service.Verify(svc => svc.ListAsync(WorkspaceId, "Request", UserId, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Create_Success_Returns201()
    {
        // Arrange
        var service = new Mock<ISavedViewsService>();
        service.Setup(svc => svc.CreateAsync(WorkspaceId, It.IsAny<SavedViewUpsertRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SavedViewWriteResult(SavedViewWriteOutcome.Success, Sample()));

        // Act
        var result = await Build(service).CreateSavedView(WorkspaceId, Body(), CancellationToken.None);

        // Assert
        Assert.IsType<CreatedResult>(result);
    }

    [Fact]
    public async Task Create_Denied_Returns403()
    {
        // Arrange — a shared view without WorkspaceAdmin.
        var service = new Mock<ISavedViewsService>();
        service.Setup(svc => svc.CreateAsync(WorkspaceId, It.IsAny<SavedViewUpsertRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SavedViewWriteResult(SavedViewWriteOutcome.Denied));

        // Act
        var result = await Build(service).CreateSavedView(WorkspaceId, Body("shared"), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Update_Success_ReturnsOk()
    {
        // Arrange
        var service = new Mock<ISavedViewsService>();
        service.Setup(svc => svc.UpdateAsync(SavedViewId, It.IsAny<SavedViewUpsertRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SavedViewWriteResult(SavedViewWriteOutcome.Success, Sample()));

        // Act
        var result = await Build(service).UpdateSavedView(SavedViewId, Body(), CancellationToken.None);

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task Update_NotFound_Returns404()
    {
        // Arrange
        var service = new Mock<ISavedViewsService>();
        service.Setup(svc => svc.UpdateAsync(SavedViewId, It.IsAny<SavedViewUpsertRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SavedViewWriteResult(SavedViewWriteOutcome.NotFound));

        // Act
        var result = await Build(service).UpdateSavedView(SavedViewId, Body(), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status404NotFound, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Update_Denied_Returns403()
    {
        // Arrange — editing another user's personal view (or a shared view without admin).
        var service = new Mock<ISavedViewsService>();
        service.Setup(svc => svc.UpdateAsync(SavedViewId, It.IsAny<SavedViewUpsertRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SavedViewWriteResult(SavedViewWriteOutcome.Denied));

        // Act
        var result = await Build(service).UpdateSavedView(SavedViewId, Body(), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Delete_Success_Returns204()
    {
        // Arrange
        var service = new Mock<ISavedViewsService>();
        service.Setup(svc => svc.DeleteAsync(SavedViewId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(SavedViewWriteOutcome.Success);

        // Act
        var result = await Build(service).DeleteSavedView(SavedViewId, CancellationToken.None);

        // Assert
        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task Delete_NotFound_Returns404()
    {
        // Arrange
        var service = new Mock<ISavedViewsService>();
        service.Setup(svc => svc.DeleteAsync(SavedViewId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(SavedViewWriteOutcome.NotFound);

        // Act
        var result = await Build(service).DeleteSavedView(SavedViewId, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status404NotFound, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task List_CancellationPropagates()
    {
        // Arrange
        var service = new Mock<ISavedViewsService>();
        var guard = new Mock<IAccessGuard>();
        guard.Setup(check => check.HasWorkspaceLevelAsync(UserId, WorkspaceId, WorkspaceLevel.Viewer, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(service, guard).ListSavedViews(WorkspaceId, "Request", cts.Token));
    }
}

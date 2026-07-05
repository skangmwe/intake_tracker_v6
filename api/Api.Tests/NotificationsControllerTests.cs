// Unit tests for NotificationsController (routing / status-code mapping only — the service is mocked).
// Covers the query happy path, unread-count, mark-all (204), mark-one own (204) vs someone else's
// (403, never disclosing existence), and cancellation-token propagation (api-testing-guidelines.md).

using McDermott.AiTracker.Api.Modules.Notifications;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class NotificationsControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();

    private static NotificationsController Build(Mock<INotificationsService> notifications)
    {
        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);
        return new NotificationsController(notifications.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
    }

    [Fact]
    public async Task Query_ReturnsOkWithPage()
    {
        // Arrange
        var page = new PaginatedResponse<NotificationDto>(
            new[] { new NotificationDto(Guid.NewGuid(), "gate-decided", "AIS-1", null, "A gate decision was recorded on AIS-1", DateTime.UtcNow, null, Guid.NewGuid()) },
            TotalCount: 1, Page: 1, PageSize: 20);
        var notifications = new Mock<INotificationsService>();
        notifications.Setup(service => service.QueryAsync(UserId, It.IsAny<NotificationQuery>(), It.IsAny<CancellationToken>())).ReturnsAsync(page);

        // Act
        var result = await Build(notifications).Query(new NotificationQuery { Page = 1, PageSize = 20 }, CancellationToken.None);

        // Assert
        Assert.Same(page, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Fact]
    public async Task UnreadCount_ReturnsOkWithCount()
    {
        // Arrange
        var notifications = new Mock<INotificationsService>();
        notifications.Setup(service => service.GetUnreadCountAsync(UserId, It.IsAny<CancellationToken>())).ReturnsAsync(3);

        // Act
        var result = await Build(notifications).UnreadCount(CancellationToken.None);

        // Assert
        var dto = Assert.IsType<UnreadCountDto>(Assert.IsType<OkObjectResult>(result).Value);
        Assert.Equal(3, dto.Count);
    }

    [Fact]
    public async Task MarkAllRead_Returns204()
    {
        // Arrange
        var notifications = new Mock<INotificationsService>();

        // Act
        var result = await Build(notifications).MarkAllRead(CancellationToken.None);

        // Assert
        Assert.IsType<NoContentResult>(result);
        notifications.Verify(service => service.MarkAllReadAsync(UserId, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task MarkRead_OwnNotification_Returns204()
    {
        // Arrange
        var id = Guid.NewGuid();
        var notifications = new Mock<INotificationsService>();
        notifications.Setup(service => service.MarkReadAsync(id, UserId, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        // Act
        var result = await Build(notifications).MarkRead(id, CancellationToken.None);

        // Assert
        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task MarkRead_OthersNotification_Returns403()
    {
        // Arrange — found=false means "not the caller's" → 403, never disclosing it exists.
        var id = Guid.NewGuid();
        var notifications = new Mock<INotificationsService>();
        notifications.Setup(service => service.MarkReadAsync(id, UserId, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        // Act
        var result = await Build(notifications).MarkRead(id, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task Query_CancellationPropagates()
    {
        // Arrange
        var notifications = new Mock<INotificationsService>();
        notifications.Setup(service => service.QueryAsync(UserId, It.IsAny<NotificationQuery>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(notifications).Query(new NotificationQuery(), cts.Token));
    }
}

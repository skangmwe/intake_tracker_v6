// Unit tests for WatchersController (routing / status-code mapping only — the service is mocked).
// Covers the list happy path (200) + no-access 403, subscribe/unsubscribe 204 + forbidden 403, and
// cancellation-token propagation (api-testing-guidelines.md). A forbidden OR non-existent record both
// come back as WatcherOutcome.Forbidden / null and map to 403, never 404 (BS §22.6).

using McDermott.AiTracker.Api.Modules.Watchers;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class WatchersControllerTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private const string RecordId = "AIS-00000042";

    private static WatchersController Build(Mock<IWatchersService> watchers)
    {
        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(user => user.UserId).Returns(UserId);
        return new WatchersController(watchers.Object, currentUser.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
    }

    [Fact]
    public async Task GetWatchers_Accessible_ReturnsOk()
    {
        // Arrange
        var dto = new WatcherListDto(
            new[] { new WatcherListItemDto(UserId, "Ana", DateTime.UtcNow) },
            IsWatching: true,
            MyPreferences: new WatcherPreferencesDto(true, true, true, true, true));
        var watchers = new Mock<IWatchersService>();
        watchers.Setup(service => service.GetAsync(RecordId, UserId, It.IsAny<CancellationToken>())).ReturnsAsync(dto);

        // Act
        var result = await Build(watchers).GetWatchers(RecordId, CancellationToken.None);

        // Assert
        Assert.Same(dto, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Fact]
    public async Task GetWatchers_NoAccess_Returns403()
    {
        // Arrange — null distinguishes "cannot see the record" (→ 403, never 404).
        var watchers = new Mock<IWatchersService>();
        watchers.Setup(service => service.GetAsync(RecordId, UserId, It.IsAny<CancellationToken>())).ReturnsAsync((WatcherListDto?)null);

        // Act
        var result = await Build(watchers).GetWatchers(RecordId, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task AddWatcher_Ok_Returns204()
    {
        // Arrange
        var watchers = new Mock<IWatchersService>();
        watchers.Setup(service => service.AddAsync(RecordId, null, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(WatcherOutcome.Ok);

        // Act
        var result = await Build(watchers).AddWatcher(RecordId, new AddWatcherRequest(), CancellationToken.None);

        // Assert
        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task AddWatcher_NullBody_DefaultsToSelfAndReturns204()
    {
        // Arrange — a bodyless POST is a self-subscribe.
        var watchers = new Mock<IWatchersService>();
        watchers.Setup(service => service.AddAsync(RecordId, null, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(WatcherOutcome.Ok);

        // Act
        var result = await Build(watchers).AddWatcher(RecordId, null, CancellationToken.None);

        // Assert
        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task AddWatcher_Forbidden_Returns403()
    {
        // Arrange
        var watchers = new Mock<IWatchersService>();
        watchers.Setup(service => service.AddAsync(RecordId, It.IsAny<Guid?>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(WatcherOutcome.Forbidden);

        // Act
        var result = await Build(watchers).AddWatcher(RecordId, new AddWatcherRequest(), CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task RemoveWatcher_Ok_Returns204()
    {
        // Arrange
        var target = Guid.NewGuid();
        var watchers = new Mock<IWatchersService>();
        watchers.Setup(service => service.RemoveAsync(RecordId, target, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(WatcherOutcome.Ok);

        // Act
        var result = await Build(watchers).RemoveWatcher(RecordId, target, CancellationToken.None);

        // Assert
        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task RemoveWatcher_Forbidden_Returns403()
    {
        // Arrange
        var target = Guid.NewGuid();
        var watchers = new Mock<IWatchersService>();
        watchers.Setup(service => service.RemoveAsync(RecordId, target, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(WatcherOutcome.Forbidden);

        // Act
        var result = await Build(watchers).RemoveWatcher(RecordId, target, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task AddWatcher_CancellationPropagates()
    {
        // Arrange
        var watchers = new Mock<IWatchersService>();
        watchers.Setup(service => service.AddAsync(RecordId, It.IsAny<Guid?>(), UserId, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(watchers).AddWatcher(RecordId, new AddWatcherRequest(), cts.Token));
    }

    [Fact]
    public async Task PatchMyWatch_Success_ReturnsRefreshedList()
    {
        // Slice 26 — the refreshed list is the wire response; the controller just delegates.
        // Arrange
        var refreshed = new WatcherListDto(
            new[] { new WatcherListItemDto(UserId, "Ana", DateTime.UtcNow, NotifyGateDecisions: false) },
            IsWatching: true,
            MyPreferences: new WatcherPreferencesDto(false, true, true, true, true));
        var watchers = new Mock<IWatchersService>();
        watchers.Setup(service => service.PatchMineAsync(RecordId, It.IsAny<WatcherPreferencesPatchRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((WatcherOutcome.Ok, refreshed));

        // Act
        var body = new WatcherPreferencesPatchRequest { IsWatching = true, NotifyGateDecisions = false };
        var result = await Build(watchers).PatchMyWatch(RecordId, body, CancellationToken.None);

        // Assert
        Assert.Same(refreshed, Assert.IsType<OkObjectResult>(result).Value);
    }

    [Fact]
    public async Task PatchMyWatch_Forbidden_Returns403()
    {
        // Arrange — cannot see the record → 403 (never 404, per BS §22.6).
        var watchers = new Mock<IWatchersService>();
        watchers.Setup(service => service.PatchMineAsync(RecordId, It.IsAny<WatcherPreferencesPatchRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((WatcherOutcome.Forbidden, (WatcherListDto?)null));

        // Act
        var result = await Build(watchers).PatchMyWatch(RecordId, new WatcherPreferencesPatchRequest { NotifyStatusChanges = false }, CancellationToken.None);

        // Assert
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task PatchMyWatch_PassesEveryPreferenceThrough()
    {
        // Slice 26 — the controller must not filter, reorder, or drop any of the five booleans.
        // Arrange
        WatcherPreferencesPatchRequest? captured = null;
        var watchers = new Mock<IWatchersService>();
        watchers
            .Setup(service => service.PatchMineAsync(RecordId, It.IsAny<WatcherPreferencesPatchRequest>(), UserId, It.IsAny<CancellationToken>()))
            .Callback<string, WatcherPreferencesPatchRequest, Guid, CancellationToken>((_, request, _, _) => captured = request)
            .ReturnsAsync((WatcherOutcome.Ok, new WatcherListDto(
                Array.Empty<WatcherListItemDto>(),
                IsWatching: true,
                MyPreferences: new WatcherPreferencesDto(true, true, true, true, true))));

        // Act
        var body = new WatcherPreferencesPatchRequest
        {
            NotifyGateDecisions = false,
            NotifyStatusChanges = true,
            NotifyTaskSignoffs = false,
            NotifySlaAndDueDateReminders = true,
            NotifyMentionsAndComments = false,
        };
        _ = await Build(watchers).PatchMyWatch(RecordId, body, CancellationToken.None);

        // Assert
        Assert.NotNull(captured);
        Assert.Equal(false, captured!.NotifyGateDecisions);
        Assert.Equal(true,  captured.NotifyStatusChanges);
        Assert.Equal(false, captured.NotifyTaskSignoffs);
        Assert.Equal(true,  captured.NotifySlaAndDueDateReminders);
        Assert.Equal(false, captured.NotifyMentionsAndComments);
    }

    [Fact]
    public async Task PatchMyWatch_CancellationPropagates()
    {
        // Arrange
        var watchers = new Mock<IWatchersService>();
        watchers.Setup(service => service.PatchMineAsync(RecordId, It.IsAny<WatcherPreferencesPatchRequest>(), UserId, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Build(watchers).PatchMyWatch(RecordId, new WatcherPreferencesPatchRequest(), cts.Token));
    }
}

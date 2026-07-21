// Unit tests for AnnouncementSchedulerService (reconciliation slice 2). The tick proc itself is covered by
// tSQLt (slice 1); these tests cover the C# orchestration the scheduler adds: each newly-published row from
// the tick fans out exactly one announcement.published event through the shared service path, a no-op sweep
// emits nothing, a failing sweep surfaces to the loop (no swallow), and the timer drives the sweep while
// cancellation (host shutdown) exits cleanly (api-testing-guidelines.md — happy path, permanent failure,
// cancellation). AppDbContext/FromSqlRaw is not unit-mockable, so the proc call sits behind
// IAnnouncementTickGateway, mocked here.

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Announcements;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class AnnouncementSchedulerServiceTests
{
    private static AnnouncementTickRow Row() => new()
    {
        AnnouncementId = Guid.NewGuid(),
        WorkspaceId = Guid.NewGuid(),
        AuthorUserId = Guid.NewGuid(),
    };

    private static AnnouncementSchedulerService Build(
        Mock<IAnnouncementTickGateway> gateway,
        Mock<IAnnouncementsService> announcements,
        int periodSeconds = 60)
    {
        var provider = new Mock<IServiceProvider>();
        provider.Setup(sp => sp.GetService(typeof(IAnnouncementTickGateway))).Returns(gateway.Object);
        provider.Setup(sp => sp.GetService(typeof(IAnnouncementsService))).Returns(announcements.Object);

        var scope = new Mock<IServiceScope>();
        scope.SetupGet(each => each.ServiceProvider).Returns(provider.Object);

        var scopeFactory = new Mock<IServiceScopeFactory>();
        scopeFactory.Setup(factory => factory.CreateScope()).Returns(scope.Object);

        var options = Options.Create(new AnnouncementSchedulerOptions { PeriodSeconds = periodSeconds });
        return new AnnouncementSchedulerService(
            scopeFactory.Object, options, NullLogger<AnnouncementSchedulerService>.Instance);
    }

    [Fact]
    public async Task RunTickAsync_WithNewlyPublishedRows_EmitsOnePublishedEventPerRowWithSharedOperationId()
    {
        // Arrange
        var firstRow = Row();
        var secondRow = Row();
        var gateway = new Mock<IAnnouncementTickGateway>();
        gateway.Setup(tick => tick.RunTickAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { firstRow, secondRow });

        var operationIds = new List<string>();
        var announcements = new Mock<IAnnouncementsService>();
        announcements
            .Setup(svc => svc.EmitPublishedAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Callback<Guid, Guid, Guid, string, CancellationToken>((_, _, _, operationId, _) => operationIds.Add(operationId))
            .Returns(Task.CompletedTask);

        var sut = Build(gateway, announcements);

        // Act
        await sut.RunTickAsync(CancellationToken.None);

        // Assert
        announcements.Verify(svc => svc.EmitPublishedAsync(
            firstRow.AnnouncementId, firstRow.WorkspaceId, firstRow.AuthorUserId, It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Once);
        announcements.Verify(svc => svc.EmitPublishedAsync(
            secondRow.AnnouncementId, secondRow.WorkspaceId, secondRow.AuthorUserId, It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Once);
        Assert.Equal(2, operationIds.Count);
        Assert.Single(operationIds.Distinct());
        Assert.False(string.IsNullOrWhiteSpace(operationIds[0]));
    }

    [Fact]
    public async Task RunTickAsync_WithNoDueRows_DoesNotEmitAnyEvent()
    {
        // Arrange
        var gateway = new Mock<IAnnouncementTickGateway>();
        gateway.Setup(tick => tick.RunTickAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<AnnouncementTickRow>());
        var announcements = new Mock<IAnnouncementsService>();
        var sut = Build(gateway, announcements);

        // Act
        await sut.RunTickAsync(CancellationToken.None);

        // Assert
        gateway.Verify(tick => tick.RunTickAsync(It.IsAny<CancellationToken>()), Times.Once);
        announcements.Verify(svc => svc.EmitPublishedAsync(
            It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task RunTickAsync_WhenOneRowFanOutFails_StillEmitsTheRemainingRows()
    {
        // Arrange — the tick has already committed both rows; the first fan-out fails.
        var failingRow = Row();
        var healthyRow = Row();
        var gateway = new Mock<IAnnouncementTickGateway>();
        gateway.Setup(tick => tick.RunTickAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { failingRow, healthyRow });

        var announcements = new Mock<IAnnouncementsService>();
        announcements
            .Setup(svc => svc.EmitPublishedAsync(
                failingRow.AnnouncementId, It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("fan-out failed"));
        announcements
            .Setup(svc => svc.EmitPublishedAsync(
                healthyRow.AnnouncementId, It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var sut = Build(gateway, announcements);

        // Act — the sweep swallows the per-row failure and continues (must not throw).
        await sut.RunTickAsync(CancellationToken.None);

        // Assert — the healthy row was still fanned out.
        announcements.Verify(svc => svc.EmitPublishedAsync(
            healthyRow.AnnouncementId, healthyRow.WorkspaceId, healthyRow.AuthorUserId, It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task RunTickAsync_WhenGatewayThrows_PropagatesAndDoesNotEmit()
    {
        // Arrange
        var gateway = new Mock<IAnnouncementTickGateway>();
        gateway.Setup(tick => tick.RunTickAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("tick failed"));
        var announcements = new Mock<IAnnouncementsService>();
        var sut = Build(gateway, announcements);

        // Act / Assert — the sweep surfaces the failure so the loop's catch handles it (no swallow, no emit).
        await Assert.ThrowsAsync<InvalidOperationException>(() => sut.RunTickAsync(CancellationToken.None));
        announcements.Verify(svc => svc.EmitPublishedAsync(
            It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task ExecuteAsync_SweepsOnTimerAndSurvivesAFailingSweepThenStopsCleanly()
    {
        // Arrange — a 1s period; the gateway signals the first sweep then throws, so this also proves a
        // failing sweep does not crash the host (spec §5/§7: tick invoked on timer, cancellation exits cleanly).
        var swept = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var gateway = new Mock<IAnnouncementTickGateway>();
        gateway.Setup(tick => tick.RunTickAsync(It.IsAny<CancellationToken>()))
            .Returns<CancellationToken>(_ =>
            {
                swept.TrySetResult();
                throw new InvalidOperationException("transient blip");
            });
        var announcements = new Mock<IAnnouncementsService>();
        var sut = Build(gateway, announcements, periodSeconds: 1);

        // Act
        await sut.StartAsync(CancellationToken.None);
        var firstSweep = await Task.WhenAny(swept.Task, Task.Delay(TimeSpan.FromSeconds(10)));

        // Assert — the timer drove the sweep, and the caught failure left the loop running (not faulted).
        Assert.Same(swept.Task, firstSweep);
        Assert.NotNull(sut.ExecuteTask);
        Assert.False(sut.ExecuteTask!.IsFaulted);

        // Act — shutdown must exit cleanly without throwing.
        await sut.StopAsync(CancellationToken.None);

        // Assert
        gateway.Verify(tick => tick.RunTickAsync(It.IsAny<CancellationToken>()), Times.AtLeastOnce);
    }

    [Fact]
    public async Task ExecuteAsync_WhenCancelledBeforeFirstSweep_ExitsWithoutRunningTheTick()
    {
        // Arrange — cancel immediately so the first period never elapses.
        var gateway = new Mock<IAnnouncementTickGateway>();
        var announcements = new Mock<IAnnouncementsService>();
        var sut = Build(gateway, announcements, periodSeconds: 60);

        // Act
        await sut.StartAsync(CancellationToken.None);
        await sut.StopAsync(CancellationToken.None);

        // Assert — clean shutdown, no sweep and no fan-out before the first period.
        gateway.Verify(tick => tick.RunTickAsync(It.IsAny<CancellationToken>()), Times.Never);
        announcements.Verify(svc => svc.EmitPublishedAsync(
            It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }
}

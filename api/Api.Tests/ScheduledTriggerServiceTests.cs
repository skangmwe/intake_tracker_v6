// Unit tests for ScheduledTriggerService (slice: triggers-engine-core, Task 1.4). Cover the C# orchestration
// the hosted service adds around the evaluator: the daily-hour gate, the atomic once-per-day claim (only the
// winner runs), invoking the evaluator then finalizing the counts, the timer driving the sweep, and clean
// cancellation on shutdown (api-testing-guidelines.md — happy path, permanent-failure/short-circuit,
// cancellation). The evaluator sits behind IScheduledTriggerEvaluator and the proc calls behind
// ITriggerGateway, both mocked here; the scope factory is stubbed like AnnouncementSchedulerServiceTests.

using McDermott.AiTracker.Api.Modules.Triggers;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class ScheduledTriggerServiceTests
{
    private static readonly DateOnly Today = new(2026, 7, 24);

    private sealed class FixedClock : IClock
    {
        public DateTimeOffset UtcNow { get; init; }
    }

    private static ScheduledTriggerService Build(
        Mock<ITriggerGateway> gateway,
        Mock<IScheduledTriggerEvaluator> evaluator,
        int utcHour,
        int dailyHour = 10,
        int pollSeconds = 60)
    {
        var provider = new Mock<IServiceProvider>();
        provider.Setup(sp => sp.GetService(typeof(ITriggerGateway))).Returns(gateway.Object);
        provider.Setup(sp => sp.GetService(typeof(IScheduledTriggerEvaluator))).Returns(evaluator.Object);

        var scope = new Mock<IServiceScope>();
        scope.SetupGet(each => each.ServiceProvider).Returns(provider.Object);
        var scopeFactory = new Mock<IServiceScopeFactory>();
        scopeFactory.Setup(factory => factory.CreateScope()).Returns(scope.Object);

        var clock = new FixedClock { UtcNow = new DateTimeOffset(2026, 7, 24, utcHour, 0, 0, TimeSpan.Zero) };
        var options = Options.Create(new ScheduledTriggerOptions { DailyHour = dailyHour, PollSeconds = pollSeconds });
        return new ScheduledTriggerService(
            scopeFactory.Object, options, clock, NullLogger<ScheduledTriggerService>.Instance);
    }

    [Fact]
    public async Task MaybeRunDailySweep_BeforeConfiguredHour_DoesNotClaimOrRun()
    {
        // Arrange — 08:00 UTC, sweep hour 10.
        var gateway = new Mock<ITriggerGateway>();
        var evaluator = new Mock<IScheduledTriggerEvaluator>();
        var sut = Build(gateway, evaluator, utcHour: 8, dailyHour: 10);

        // Act
        await sut.MaybeRunDailySweepAsync(CancellationToken.None);

        // Assert — too early: no claim attempt, no evaluation.
        gateway.Verify(g => g.TryBeginSweepAsync(It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()), Times.Never);
        evaluator.Verify(e => e.RunDailySweepAsync(It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task MaybeRunDailySweep_AlreadyClaimed_DoesNotRunEvaluatorOrFinalize()
    {
        // Arrange — hour has arrived but another replica already claimed today.
        var gateway = new Mock<ITriggerGateway>();
        gateway.Setup(g => g.TryBeginSweepAsync(Today, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        var evaluator = new Mock<IScheduledTriggerEvaluator>();
        var sut = Build(gateway, evaluator, utcHour: 11, dailyHour: 10);

        // Act
        await sut.MaybeRunDailySweepAsync(CancellationToken.None);

        // Assert — the loser neither evaluates nor finalizes.
        evaluator.Verify(e => e.RunDailySweepAsync(It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()), Times.Never);
        gateway.Verify(g => g.FinalizeSweepAsync(It.IsAny<DateOnly>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task MaybeRunDailySweep_ClaimsTheDay_RunsEvaluatorThenFinalizesWithItsCounts()
    {
        // Arrange — hour arrived and this replica wins the claim.
        var gateway = new Mock<ITriggerGateway>();
        gateway.Setup(g => g.TryBeginSweepAsync(Today, It.IsAny<CancellationToken>())).ReturnsAsync(true);
        var evaluator = new Mock<IScheduledTriggerEvaluator>();
        evaluator.Setup(e => e.RunDailySweepAsync(Today, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SweepSummary(2, 1, 0));
        var sut = Build(gateway, evaluator, utcHour: 11, dailyHour: 10);

        // Act
        await sut.MaybeRunDailySweepAsync(CancellationToken.None);

        // Assert — the sweep ran for today and its counts were recorded.
        evaluator.Verify(e => e.RunDailySweepAsync(Today, It.IsAny<CancellationToken>()), Times.Once);
        gateway.Verify(g => g.FinalizeSweepAsync(Today, 2, 1, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ExecuteAsync_DrivesSweepOnTimerThenStopsCleanly()
    {
        // Arrange — 1s poll; the claim signals the first sweep so we can prove the timer drove it.
        var swept = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var gateway = new Mock<ITriggerGateway>();
        gateway.Setup(g => g.TryBeginSweepAsync(Today, It.IsAny<CancellationToken>()))
            .Returns<DateOnly, CancellationToken>((_, _) => { swept.TrySetResult(); return Task.FromResult(false); });
        var evaluator = new Mock<IScheduledTriggerEvaluator>();
        var sut = Build(gateway, evaluator, utcHour: 11, dailyHour: 10, pollSeconds: 1);

        // Act
        await sut.StartAsync(CancellationToken.None);
        var firstSweep = await Task.WhenAny(swept.Task, Task.Delay(TimeSpan.FromSeconds(10)));

        // Assert — the timer drove the poll, and shutdown is clean (not faulted).
        Assert.Same(swept.Task, firstSweep);
        Assert.NotNull(sut.ExecuteTask);
        Assert.False(sut.ExecuteTask!.IsFaulted);
        await sut.StopAsync(CancellationToken.None);
        gateway.Verify(g => g.TryBeginSweepAsync(Today, It.IsAny<CancellationToken>()), Times.AtLeastOnce);
    }

    [Fact]
    public async Task ExecuteAsync_CancelledBeforeFirstTick_DoesNotClaim()
    {
        // Arrange — a long poll so the first period never elapses before shutdown.
        var gateway = new Mock<ITriggerGateway>();
        var evaluator = new Mock<IScheduledTriggerEvaluator>();
        var sut = Build(gateway, evaluator, utcHour: 11, dailyHour: 10, pollSeconds: 60);

        // Act
        await sut.StartAsync(CancellationToken.None);
        await sut.StopAsync(CancellationToken.None);

        // Assert — clean shutdown with no sweep before the first period.
        gateway.Verify(g => g.TryBeginSweepAsync(It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}

// Unit tests for ScheduledTriggerEvaluator (slice: triggers-engine-core, Task 1.4). The procs are covered
// by tSQLt; these cover the C# orchestration: condition evaluation over the field-value map (via the REAL
// ConditionEngine + a fixed clock, so @today is deterministic), the fire-once / re-nag cadence, recipient
// resolution from user-reference fields (+ the watchers flag), the trigger.fired payload shape, per-record
// failure-continue, empty-candidate no-op, and cancellation (api-testing-guidelines.md — happy path,
// permanent failure, cancellation, plus every branch). AppDbContext/FromSqlRaw sits behind ITriggerGateway.

using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Triggers;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Rules;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class ScheduledTriggerEvaluatorTests
{
    private static readonly DateOnly Today = new(2026, 7, 24);
    private static readonly Guid AnalystId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    private sealed class FixedClock : IClock
    {
        public DateTimeOffset UtcNow { get; init; }
    }

    private static EnabledTriggerRow Trigger(
        string cadence = "RepeatEveryNDays",
        int? repeatIntervalDays = 1,
        string recipients = "[\"assignedAnalyst\"]",
        string conditionsJson = "[{\"whenFieldKey\":\"dueDate\",\"comparator\":\"lt\",\"compareValue\":\"@today\"}]",
        string category = "sla-reminder") => new()
        {
            TriggerId = Guid.NewGuid(),
            WorkspaceId = Guid.NewGuid(),
            ObjectType = "Request",
            Kind = "Authored",
            Name = "SLA breach",
            Cadence = cadence,
            RepeatIntervalDays = repeatIntervalDays,
            NotificationCategory = category,
            Recipients = recipients,
            NotificationTitle = "A request is overdue",
            NotificationBody = "body",
            ConditionsJson = conditionsJson,
        };

    // A candidate whose dueDate is in the past (so `dueDate lt @today` matches) with an assigned analyst.
    private static TriggerCandidateRow OverdueCandidate(string recordId = "LIT-9001") => new()
    {
        RecordId = recordId,
        FieldValuesJson = $"{{\"dueDate\":\"2026-07-20\",\"assignedAnalyst\":\"{AnalystId}\"}}",
    };

    private static (ScheduledTriggerEvaluator Sut, Mock<ITriggerGateway> Gateway, Mock<IEventSpine> Spine) Build()
    {
        var clock = new FixedClock { UtcNow = new DateTimeOffset(2026, 7, 24, 12, 0, 0, TimeSpan.Zero) };
        var gateway = new Mock<ITriggerGateway>();
        var spine = new Mock<IEventSpine>();
        spine.Setup(s => s.EmitAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        gateway.Setup(g => g.UpsertFireAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        var sut = new ScheduledTriggerEvaluator(
            gateway.Object, new ConditionEngine(clock), spine.Object, clock, NullLogger<ScheduledTriggerEvaluator>.Instance);
        return (sut, gateway, spine);
    }

    private static void Arrange(
        Mock<ITriggerGateway> gateway,
        EnabledTriggerRow trigger,
        IReadOnlyList<TriggerCandidateRow> candidates,
        IReadOnlyList<TriggerWatermarkRow>? watermarks = null)
    {
        gateway.Setup(g => g.GetEnabledAuthoredTriggersAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { trigger });
        gateway.Setup(g => g.GetCandidatesAsync(trigger.TriggerId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(candidates);
        gateway.Setup(g => g.GetWatermarksAsync(trigger.TriggerId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(watermarks ?? Array.Empty<TriggerWatermarkRow>());
    }

    [Fact]
    public async Task RunDailySweep_AuthoredConditionTrue_EmitsTriggerFiredAndStampsWatermark()
    {
        // Arrange
        var (sut, gateway, spine) = Build();
        var trigger = Trigger();
        EventEnvelope? captured = null;
        spine.Setup(s => s.EmitAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()))
            .Callback<EventEnvelope, CancellationToken>((env, _) => captured = env)
            .Returns(Task.CompletedTask);
        Arrange(gateway, trigger, new[] { OverdueCandidate() });

        // Act
        var summary = await sut.RunDailySweepAsync(Today, CancellationToken.None);

        // Assert
        Assert.Equal(1, summary.Fired);
        Assert.NotNull(captured);
        Assert.Equal("trigger.fired", captured!.EventType);
        Assert.Equal("LIT-9001", captured.RecordId);
        using var payload = JsonDocument.Parse(captured.PayloadJson);
        Assert.Equal("sla-reminder", payload.RootElement.GetProperty("kind").GetString());
        Assert.Equal(AnalystId.ToString(), payload.RootElement.GetProperty("recipientUserIds")[0].GetString());
        Assert.False(payload.RootElement.GetProperty("includeWatchers").GetBoolean());
        gateway.Verify(g => g.UpsertFireAsync(trigger.TriggerId, "LIT-9001", Today, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task RunDailySweep_ConditionFalse_DoesNotEmitOrStamp()
    {
        // Arrange — dueDate is in the future, so `dueDate lt @today` is false.
        var (sut, gateway, spine) = Build();
        var trigger = Trigger();
        var future = new TriggerCandidateRow
        {
            RecordId = "LIT-9002",
            FieldValuesJson = $"{{\"dueDate\":\"2026-12-31\",\"assignedAnalyst\":\"{AnalystId}\"}}",
        };
        Arrange(gateway, trigger, new[] { future });

        // Act
        var summary = await sut.RunDailySweepAsync(Today, CancellationToken.None);

        // Assert
        Assert.Equal(0, summary.Fired);
        spine.Verify(s => s.EmitAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task RunDailySweep_OnceCadenceWithWatermark_DoesNotRefire()
    {
        // Arrange
        var (sut, gateway, spine) = Build();
        var trigger = Trigger(cadence: "Once", repeatIntervalDays: null);
        var watermark = new[] { new TriggerWatermarkRow { RecordId = "LIT-9001", LastFiredDate = new DateTime(2026, 7, 20) } };
        Arrange(gateway, trigger, new[] { OverdueCandidate() }, watermark);

        // Act
        var summary = await sut.RunDailySweepAsync(Today, CancellationToken.None);

        // Assert — Once fires only on the first matching day; a present watermark blocks re-fire.
        Assert.Equal(0, summary.Fired);
        spine.Verify(s => s.EmitAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task RunDailySweep_RepeatIntervalElapsed_Refires()
    {
        // Arrange — last fired 2 days ago, interval 1 → 2026-07-22 + 1 <= 2026-07-24.
        var (sut, gateway, spine) = Build();
        var trigger = Trigger(cadence: "RepeatEveryNDays", repeatIntervalDays: 1);
        var watermark = new[] { new TriggerWatermarkRow { RecordId = "LIT-9001", LastFiredDate = new DateTime(2026, 7, 22) } };
        Arrange(gateway, trigger, new[] { OverdueCandidate() }, watermark);

        // Act
        var summary = await sut.RunDailySweepAsync(Today, CancellationToken.None);

        // Assert
        Assert.Equal(1, summary.Fired);
        spine.Verify(s => s.EmitAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task RunDailySweep_RepeatIntervalNotElapsed_DoesNotRefire()
    {
        // Arrange — last fired today, interval 3 → 2026-07-24 + 3 > 2026-07-24.
        var (sut, gateway, spine) = Build();
        var trigger = Trigger(cadence: "RepeatEveryNDays", repeatIntervalDays: 3);
        var watermark = new[] { new TriggerWatermarkRow { RecordId = "LIT-9001", LastFiredDate = new DateTime(2026, 7, 24) } };
        Arrange(gateway, trigger, new[] { OverdueCandidate() }, watermark);

        // Act
        var summary = await sut.RunDailySweepAsync(Today, CancellationToken.None);

        // Assert
        Assert.Equal(0, summary.Fired);
        spine.Verify(s => s.EmitAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task RunDailySweep_EmptyConditions_FailsClosedNoEmit()
    {
        // Arrange — an authored trigger with no conditions must not mass-notify.
        var (sut, gateway, spine) = Build();
        var trigger = Trigger(conditionsJson: "[]");
        Arrange(gateway, trigger, new[] { OverdueCandidate() });

        // Act
        var summary = await sut.RunDailySweepAsync(Today, CancellationToken.None);

        // Assert
        Assert.Equal(0, summary.Fired);
        spine.Verify(s => s.EmitAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task RunDailySweep_WatchersRecipient_SetsIncludeWatchers()
    {
        // Arrange
        var (sut, gateway, spine) = Build();
        var trigger = Trigger(recipients: "[\"watchers\"]");
        EventEnvelope? captured = null;
        spine.Setup(s => s.EmitAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()))
            .Callback<EventEnvelope, CancellationToken>((env, _) => captured = env)
            .Returns(Task.CompletedTask);
        Arrange(gateway, trigger, new[] { OverdueCandidate() });

        // Act
        await sut.RunDailySweepAsync(Today, CancellationToken.None);

        // Assert — no explicit user ids, but includeWatchers is set so the fan-out resolves the roster.
        Assert.NotNull(captured);
        using var payload = JsonDocument.Parse(captured!.PayloadJson);
        Assert.True(payload.RootElement.GetProperty("includeWatchers").GetBoolean());
        Assert.Empty(payload.RootElement.GetProperty("recipientUserIds").EnumerateArray());
    }

    [Fact]
    public async Task RunDailySweep_NoResolvableRecipients_SkipsEmit()
    {
        // Arrange — recipient field key is present but the record has no value for it (no user to notify).
        var (sut, gateway, spine) = Build();
        var trigger = Trigger(recipients: "[\"businessOwner\"]");
        Arrange(gateway, trigger, new[] { OverdueCandidate() }); // candidate has assignedAnalyst, not businessOwner

        // Act
        var summary = await sut.RunDailySweepAsync(Today, CancellationToken.None);

        // Assert — nothing to notify, and no watermark stamped so a later population can still fire.
        Assert.Equal(0, summary.Fired);
        spine.Verify(s => s.EmitAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()), Times.Never);
        gateway.Verify(g => g.UpsertFireAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task RunDailySweep_NoCandidates_EmitsNothing()
    {
        // Arrange
        var (sut, gateway, spine) = Build();
        var trigger = Trigger();
        Arrange(gateway, trigger, Array.Empty<TriggerCandidateRow>());

        // Act
        var summary = await sut.RunDailySweepAsync(Today, CancellationToken.None);

        // Assert
        Assert.Equal(1, summary.Evaluated);
        Assert.Equal(0, summary.Fired);
        spine.Verify(s => s.EmitAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task RunDailySweep_OneRecordFanOutThrows_ContinuesOthers()
    {
        // Arrange — two matching records; the first emit throws, the second must still fire.
        var (sut, gateway, spine) = Build();
        var trigger = Trigger();
        var first = OverdueCandidate("LIT-9001");
        var second = OverdueCandidate("LIT-9002");
        Arrange(gateway, trigger, new[] { first, second });
        spine.Setup(s => s.EmitAsync(It.Is<EventEnvelope>(e => e.RecordId == "LIT-9001"), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("fan-out failed"));

        // Act — must not throw.
        var summary = await sut.RunDailySweepAsync(Today, CancellationToken.None);

        // Assert
        Assert.Equal(1, summary.Fired);
        Assert.Equal(1, summary.FailedFanOut);
        spine.Verify(s => s.EmitAsync(It.Is<EventEnvelope>(e => e.RecordId == "LIT-9002"), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task RunDailySweep_CancelledToken_ThrowsWithoutEmitting()
    {
        // Arrange
        var (sut, gateway, spine) = Build();
        var trigger = Trigger();
        Arrange(gateway, trigger, new[] { OverdueCandidate() });
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act / Assert — the sweep observes cancellation and exits without emitting.
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => sut.RunDailySweepAsync(Today, cts.Token));
        spine.Verify(s => s.EmitAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}

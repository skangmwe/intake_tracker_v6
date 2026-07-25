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
        // Both trigger-kind getters default to empty so a test that only exercises one loop leaves the other a no-op.
        gateway.Setup(g => g.GetEnabledAuthoredTriggersAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<EnabledTriggerRow>());
        gateway.Setup(g => g.GetEnabledTaskOverdueTriggersAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<EnabledTriggerRow>());
        gateway.Setup(g => g.GetEnabledApprovalOverdueTriggersAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<EnabledTriggerRow>());
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
        gateway.Setup(g => g.GetCandidatesAsync(trigger.TriggerId, It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(candidates);
        gateway.Setup(g => g.GetWatermarksAsync(trigger.TriggerId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(watermarks ?? Array.Empty<TriggerWatermarkRow>());
    }

    // ─── TaskOverdue (built-in) fixtures ────────────────────────────────
    private static readonly Guid AssigneeId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    private static EnabledTriggerRow TaskOverdueTrigger(string cadence = "RepeatEveryNDays", int? repeatIntervalDays = 1) => new()
    {
        TriggerId = Guid.NewGuid(),
        WorkspaceId = Guid.NewGuid(),
        ObjectType = "Task",
        Kind = "TaskOverdue",
        Name = "Overdue task reminder",
        Cadence = cadence,
        RepeatIntervalDays = repeatIntervalDays,
        NotificationCategory = "task-overdue",
        Recipients = "[]", // unused — the recipient is the task assignee, resolved from the candidate
        NotificationTitle = "A task is overdue",
        NotificationBody = "body",
        ConditionsJson = "[]",
    };

    // A TaskOverdue candidate: RecordId is the parent request (fan-out target); WatermarkKey is the TaskId
    // (per-task dedup); no field map; the assignee is the recipient.
    private static TriggerCandidateRow OverdueTaskCandidate(
        string recordId = "LIT-9001", string? taskId = null, Guid? assignee = null) => new()
    {
        RecordId = recordId,
        WatermarkKey = taskId ?? "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        FieldValuesJson = null,
        AssigneeUserId = assignee ?? AssigneeId,
    };

    private static void ArrangeTaskOverdue(
        Mock<ITriggerGateway> gateway,
        EnabledTriggerRow trigger,
        IReadOnlyList<TriggerCandidateRow> candidates,
        IReadOnlyList<TriggerWatermarkRow>? watermarks = null)
    {
        gateway.Setup(g => g.GetEnabledTaskOverdueTriggersAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { trigger });
        gateway.Setup(g => g.GetCandidatesAsync(trigger.TriggerId, It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()))
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

    // ─── TaskOverdue (built-in fixed-condition) ─────────────────────────
    [Fact]
    public async Task RunDailySweep_TaskOverdueWithAssignee_EmitsToAssigneeAndStampsTaskWatermark()
    {
        // Arrange — one overdue task (SQL pre-filtered); the assignee is the sole recipient.
        var (sut, gateway, spine) = Build();
        var trigger = TaskOverdueTrigger();
        EventEnvelope? captured = null;
        spine.Setup(s => s.EmitAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()))
            .Callback<EventEnvelope, CancellationToken>((env, _) => captured = env)
            .Returns(Task.CompletedTask);
        var taskId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
        ArrangeTaskOverdue(gateway, trigger, new[] { OverdueTaskCandidate("LIT-9001", taskId, AssigneeId) });

        // Act
        var summary = await sut.RunDailySweepAsync(Today, CancellationToken.None);

        // Assert
        Assert.Equal(1, summary.Fired);
        Assert.NotNull(captured);
        Assert.Equal("trigger.fired", captured!.EventType);
        Assert.Equal("LIT-9001", captured.RecordId); // fan-out targets the parent request, not the task
        using var payload = JsonDocument.Parse(captured.PayloadJson);
        Assert.Equal("task-overdue", payload.RootElement.GetProperty("kind").GetString());
        Assert.Equal(AssigneeId.ToString(), payload.RootElement.GetProperty("recipientUserIds")[0].GetString());
        Assert.False(payload.RootElement.GetProperty("includeWatchers").GetBoolean());
        // Watermark is keyed on the TaskId, not the parent request id.
        gateway.Verify(g => g.UpsertFireAsync(trigger.TriggerId, taskId, Today, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task RunDailySweep_TaskOverdueNoAssignee_SkipsWithoutStamp()
    {
        // Arrange — an unassigned overdue task has no one to notify.
        var (sut, gateway, spine) = Build();
        var trigger = TaskOverdueTrigger();
        var unassigned = new TriggerCandidateRow
        {
            RecordId = "LIT-9001",
            WatermarkKey = "cccccccc-cccc-cccc-cccc-cccccccccccc",
            FieldValuesJson = null,
            AssigneeUserId = null,
        };
        ArrangeTaskOverdue(gateway, trigger, new[] { unassigned });

        // Act
        var summary = await sut.RunDailySweepAsync(Today, CancellationToken.None);

        // Assert — nothing emitted and no watermark stamped, so assigning the task later can still fire.
        Assert.Equal(0, summary.Fired);
        spine.Verify(s => s.EmitAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()), Times.Never);
        gateway.Verify(g => g.UpsertFireAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task RunDailySweep_TaskOverdueOnceWatermarkOnTaskId_DoesNotRefire()
    {
        // Arrange — the task already fired once (watermark keyed on its TaskId); 'Once' blocks a re-fire.
        var (sut, gateway, spine) = Build();
        var trigger = TaskOverdueTrigger(cadence: "Once", repeatIntervalDays: null);
        var taskId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
        var watermark = new[] { new TriggerWatermarkRow { RecordId = taskId, LastFiredDate = new DateTime(2026, 7, 20) } };
        ArrangeTaskOverdue(gateway, trigger, new[] { OverdueTaskCandidate("LIT-9001", taskId, AssigneeId) }, watermark);

        // Act
        var summary = await sut.RunDailySweepAsync(Today, CancellationToken.None);

        // Assert
        Assert.Equal(0, summary.Fired);
        spine.Verify(s => s.EmitAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task RunDailySweep_TwoOverdueTasksSameRequest_FireIndependentlyPerTask()
    {
        // Arrange — two overdue tasks on the SAME request; one already fired. Keying on TaskId (not the
        // shared request id) means the second still fires.
        var (sut, gateway, spine) = Build();
        var trigger = TaskOverdueTrigger(cadence: "Once", repeatIntervalDays: null);
        var firedTaskId = "11111111-aaaa-4000-8000-000000000001";
        var freshTaskId = "11111111-aaaa-4000-8000-000000000002";
        var watermark = new[] { new TriggerWatermarkRow { RecordId = firedTaskId, LastFiredDate = new DateTime(2026, 7, 20) } };
        ArrangeTaskOverdue(gateway, trigger, new[]
        {
            OverdueTaskCandidate("LIT-9001", firedTaskId, AssigneeId),
            OverdueTaskCandidate("LIT-9001", freshTaskId, AssigneeId),
        }, watermark);

        // Act
        var summary = await sut.RunDailySweepAsync(Today, CancellationToken.None);

        // Assert — only the not-yet-fired task fires; its watermark is stamped on its own TaskId.
        Assert.Equal(1, summary.Fired);
        gateway.Verify(g => g.UpsertFireAsync(trigger.TriggerId, freshTaskId, Today, It.IsAny<CancellationToken>()), Times.Once);
        gateway.Verify(g => g.UpsertFireAsync(trigger.TriggerId, firedTaskId, It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task RunDailySweep_TaskOverdueCancelledToken_ThrowsWithoutEmitting()
    {
        // Arrange
        var (sut, gateway, spine) = Build();
        var trigger = TaskOverdueTrigger();
        ArrangeTaskOverdue(gateway, trigger, new[] { OverdueTaskCandidate() });
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act / Assert
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => sut.RunDailySweepAsync(Today, cts.Token));
        spine.Verify(s => s.EmitAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // ─── ApprovalOverdue (built-in) fixtures ────────────────────────────
    private static readonly Guid ApproverA = Guid.Parse("aaaa1111-1111-1111-1111-111111111111");
    private static readonly Guid ApproverB = Guid.Parse("bbbb2222-2222-2222-2222-222222222222");

    // One frozen slot with a single eligible member — the FrozenApproverSet JSON shape produced by usp_OpenGate.
    private static string Slot(int index, Guid userId) =>
        $"{{\"slotIndex\":{index},\"roleLabel\":\"R{index}\",\"displayLabel\":\"R{index}\"," +
        $"\"eligibleMembers\":[{{\"userId\":\"{userId}\",\"displayName\":\"Member {index}\"}}]}}";

    private static string ApproverSet(params string[] slots) => "[" + string.Join(",", slots) + "]";

    private static EnabledTriggerRow ApprovalOverdueTrigger(string cadence = "RepeatEveryNDays", int? repeatIntervalDays = 1) => new()
    {
        TriggerId = Guid.NewGuid(),
        WorkspaceId = Guid.NewGuid(),
        ObjectType = "Approval",
        Kind = "ApprovalOverdue",
        Name = "Overdue approval reminder",
        Cadence = cadence,
        RepeatIntervalDays = repeatIntervalDays,
        NotificationCategory = "approval-overdue",
        Recipients = "[]", // unused — recipients are the frozen eligible approvers on the candidate
        NotificationTitle = "An approval is overdue",
        NotificationBody = "body",
        ConditionsJson = "[]",
    };

    // An ApprovalOverdue candidate: RecordId is the parent request (fan-out target); WatermarkKey is the
    // ApprovalRequestId (per-gate dedup); recipients come from ApproverSetJson; no field map, no assignee.
    private static TriggerCandidateRow OverdueApprovalCandidate(
        string recordId = "LIT-9001", string? approvalId = null, string? approverSetJson = null) => new()
    {
        RecordId = recordId,
        WatermarkKey = approvalId ?? "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
        FieldValuesJson = null,
        AssigneeUserId = null,
        ApproverSetJson = approverSetJson ?? ApproverSet(Slot(0, ApproverA), Slot(1, ApproverB)),
    };

    private static void ArrangeApprovalOverdue(
        Mock<ITriggerGateway> gateway,
        EnabledTriggerRow trigger,
        IReadOnlyList<TriggerCandidateRow> candidates,
        IReadOnlyList<TriggerWatermarkRow>? watermarks = null)
    {
        gateway.Setup(g => g.GetEnabledApprovalOverdueTriggersAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { trigger });
        gateway.Setup(g => g.GetCandidatesAsync(trigger.TriggerId, It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(candidates);
        gateway.Setup(g => g.GetWatermarksAsync(trigger.TriggerId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(watermarks ?? Array.Empty<TriggerWatermarkRow>());
    }

    // ─── ApprovalOverdue (built-in fixed-condition) ─────────────────────
    [Fact]
    public async Task RunDailySweep_ApprovalOverdue_EmitsToEligibleApproversKeyedOnApprovalId()
    {
        // Arrange — one overdue gate (SQL pre-filtered) with two eligible approvers across two slots.
        var (sut, gateway, spine) = Build();
        var trigger = ApprovalOverdueTrigger();
        EventEnvelope? captured = null;
        spine.Setup(s => s.EmitAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()))
            .Callback<EventEnvelope, CancellationToken>((env, _) => captured = env)
            .Returns(Task.CompletedTask);
        var approvalId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
        ArrangeApprovalOverdue(gateway, trigger, new[] { OverdueApprovalCandidate("LIT-9001", approvalId) });

        // Act
        var summary = await sut.RunDailySweepAsync(Today, CancellationToken.None);

        // Assert
        Assert.Equal(1, summary.Fired);
        Assert.NotNull(captured);
        Assert.Equal("trigger.fired", captured!.EventType);
        Assert.Equal("LIT-9001", captured.RecordId); // fan-out targets the parent request, not the gate
        using var payload = JsonDocument.Parse(captured.PayloadJson);
        Assert.Equal("approval-overdue", payload.RootElement.GetProperty("kind").GetString());
        var recipients = payload.RootElement.GetProperty("recipientUserIds").EnumerateArray().Select(element => element.GetString()).ToList();
        Assert.Contains(ApproverA.ToString(), recipients);
        Assert.Contains(ApproverB.ToString(), recipients);
        Assert.False(payload.RootElement.GetProperty("includeWatchers").GetBoolean());
        gateway.Verify(g => g.UpsertFireAsync(trigger.TriggerId, approvalId, Today, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task RunDailySweep_ApprovalOverdueNoEligibleApprovers_SkipsWithoutStamp()
    {
        // Arrange — a frozen approver set with no members (all approvers removed) → no one to notify.
        var (sut, gateway, spine) = Build();
        var trigger = ApprovalOverdueTrigger();
        ArrangeApprovalOverdue(gateway, trigger, new[] { OverdueApprovalCandidate(approverSetJson: "[]") });

        // Act
        var summary = await sut.RunDailySweepAsync(Today, CancellationToken.None);

        // Assert — nothing emitted and no watermark stamped, so a re-populated slot can still fire later.
        Assert.Equal(0, summary.Fired);
        spine.Verify(s => s.EmitAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()), Times.Never);
        gateway.Verify(g => g.UpsertFireAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<DateOnly>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task RunDailySweep_ApprovalOverdueSameApproverInTwoSlots_DedupesRecipients()
    {
        // Arrange — the same person is the eligible approver on two slots; they should be notified once.
        var (sut, gateway, spine) = Build();
        var trigger = ApprovalOverdueTrigger();
        EventEnvelope? captured = null;
        spine.Setup(s => s.EmitAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()))
            .Callback<EventEnvelope, CancellationToken>((env, _) => captured = env)
            .Returns(Task.CompletedTask);
        var dupSet = ApproverSet(Slot(0, ApproverA), Slot(1, ApproverA));
        ArrangeApprovalOverdue(gateway, trigger, new[] { OverdueApprovalCandidate(approverSetJson: dupSet) });

        // Act
        await sut.RunDailySweepAsync(Today, CancellationToken.None);

        // Assert
        Assert.NotNull(captured);
        using var payload = JsonDocument.Parse(captured!.PayloadJson);
        var recipients = payload.RootElement.GetProperty("recipientUserIds").EnumerateArray().Select(element => element.GetString()).ToList();
        Assert.Single(recipients);
        Assert.Equal(ApproverA.ToString(), recipients[0]);
    }

    [Fact]
    public async Task RunDailySweep_ApprovalOverdueCancelledToken_ThrowsWithoutEmitting()
    {
        // Arrange
        var (sut, gateway, spine) = Build();
        var trigger = ApprovalOverdueTrigger();
        ArrangeApprovalOverdue(gateway, trigger, new[] { OverdueApprovalCandidate() });
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act / Assert
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => sut.RunDailySweepAsync(Today, cts.Token));
        spine.Verify(s => s.EmitAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}

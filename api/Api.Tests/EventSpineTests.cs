// Unit tests for EventSpine — the single emission layer. Covers the required cases
// from api-testing-guidelines.md: happy path (audit → notification fan-out → publish, in order),
// permanent failure (no retry, no swallow), cancellation. Dependencies are mocked (no database,
// no Service Bus).

using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Messaging;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class EventSpineTests
{
    private static EventEnvelope BuildEnvelope() => new(
        EventId: Guid.NewGuid(),
        EventType: "request.created",
        WorkspaceId: Guid.NewGuid(),
        RecordId: "AIS-00000001",
        ActorUserId: Guid.NewGuid(),
        EventAt: DateTimeOffset.UtcNow,
        PayloadJson: "{}",
        OperationId: "op-123");

    [Fact]
    public async Task EmitAsync_HappyPath_WritesAuditThenFansOutThenPublishes()
    {
        // Arrange
        var callOrder = new List<string>();
        var auditWriter = new Mock<IAuditWriter>();
        var fanout = new Mock<INotificationFanout>();
        var publisher = new Mock<IServiceBusPublisher>();
        var envelope = BuildEnvelope();

        auditWriter.Setup(writer => writer.WriteAsync(envelope, It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask)
            .Callback(() => callOrder.Add("audit"));
        fanout.Setup(fan => fan.FanOutAsync(envelope, It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask)
            .Callback(() => callOrder.Add("fanout"));
        publisher.Setup(pub => pub.PublishAsync(envelope, It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask)
            .Callback(() => callOrder.Add("publish"));

        var sut = new EventSpine(auditWriter.Object, fanout.Object, publisher.Object);

        // Act
        await sut.EmitAsync(envelope, CancellationToken.None);

        // Assert — audit is durable first, then notifications materialise, then cross-service publish.
        auditWriter.Verify(writer => writer.WriteAsync(envelope, It.IsAny<CancellationToken>()), Times.Once);
        fanout.Verify(fan => fan.FanOutAsync(envelope, It.IsAny<CancellationToken>()), Times.Once);
        publisher.Verify(pub => pub.PublishAsync(envelope, It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal(new[] { "audit", "fanout", "publish" }, callOrder);
    }

    [Fact]
    public async Task EmitAsync_FanOutThrows_PropagatesAndSkipsPublish()
    {
        // Arrange — a fan-out failure must unwind the whole emit (atomic with the state change);
        // publish must not run after it.
        var auditWriter = new Mock<IAuditWriter>();
        var fanout = new Mock<INotificationFanout>();
        var publisher = new Mock<IServiceBusPublisher>();
        var envelope = BuildEnvelope();

        auditWriter.Setup(writer => writer.WriteAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        fanout.Setup(fan => fan.FanOutAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("permanent"));

        var sut = new EventSpine(auditWriter.Object, fanout.Object, publisher.Object);

        // Act + Assert
        await Assert.ThrowsAsync<InvalidOperationException>(() => sut.EmitAsync(envelope, CancellationToken.None));
        fanout.Verify(fan => fan.FanOutAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()), Times.Once);
        publisher.Verify(pub => pub.PublishAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task EmitAsync_PublishThrows_PropagatesWithoutRetry()
    {
        // Arrange
        var auditWriter = new Mock<IAuditWriter>();
        var fanout = new Mock<INotificationFanout>();
        var publisher = new Mock<IServiceBusPublisher>();
        var envelope = BuildEnvelope();

        auditWriter.Setup(writer => writer.WriteAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        fanout.Setup(fan => fan.FanOutAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        publisher.Setup(pub => pub.PublishAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("permanent"));

        var sut = new EventSpine(auditWriter.Object, fanout.Object, publisher.Object);

        // Act + Assert — the exception is not swallowed, and publish is attempted once.
        await Assert.ThrowsAsync<InvalidOperationException>(() => sut.EmitAsync(envelope, CancellationToken.None));
        publisher.Verify(pub => pub.PublishAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()), Times.Once);
        auditWriter.Verify(writer => writer.WriteAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task EmitAsync_Cancelled_ThrowsAndSkipsSideEffects()
    {
        // Arrange
        var auditWriter = new Mock<IAuditWriter>();
        var fanout = new Mock<INotificationFanout>();
        var publisher = new Mock<IServiceBusPublisher>();
        var sut = new EventSpine(auditWriter.Object, fanout.Object, publisher.Object);
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() => sut.EmitAsync(BuildEnvelope(), cts.Token));
        auditWriter.Verify(writer => writer.WriteAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()), Times.Never);
        fanout.Verify(fan => fan.FanOutAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()), Times.Never);
        publisher.Verify(pub => pub.PublishAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task EmitAsync_NullEnvelope_Throws()
    {
        // Arrange
        var sut = new EventSpine(Mock.Of<IAuditWriter>(), Mock.Of<INotificationFanout>(), Mock.Of<IServiceBusPublisher>());

        // Act + Assert
        await Assert.ThrowsAsync<ArgumentNullException>(() => sut.EmitAsync(null!, CancellationToken.None));
    }
}

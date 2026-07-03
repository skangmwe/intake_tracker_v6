// Unit tests for ServiceBusPublisher. The meaningful unit-testable behaviour without
// a real Service Bus namespace is the no-op path (local/dev) plus the pre-flight
// guards. Publishing against a live namespace is covered by integration tests later.

using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Messaging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class ServiceBusPublisherTests
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

    private static ServiceBusPublisher CreateNoOpPublisher() =>
        new(Options.Create(new ServiceBusOptions { Namespace = string.Empty }),
            NullLogger<ServiceBusPublisher>.Instance);

    [Fact]
    public async Task PublishAsync_NamespaceNotConfigured_NoOps()
    {
        // Arrange
        await using var sut = CreateNoOpPublisher();

        // Act — no Service Bus configured: completes without attempting a connection.
        await sut.PublishAsync(BuildEnvelope(), CancellationToken.None);

        // Assert — reaching here without throwing is the assertion; there is no side effect to observe.
        Assert.True(true);
    }

    [Fact]
    public async Task PublishAsync_Cancelled_Throws()
    {
        // Arrange
        await using var sut = CreateNoOpPublisher();
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert — cancellation is honoured before any work, even in no-op mode.
        await Assert.ThrowsAsync<OperationCanceledException>(() => sut.PublishAsync(BuildEnvelope(), cts.Token));
    }

    [Fact]
    public async Task PublishAsync_NullEnvelope_Throws()
    {
        // Arrange
        await using var sut = CreateNoOpPublisher();

        // Act + Assert
        await Assert.ThrowsAsync<ArgumentNullException>(() => sut.PublishAsync(null!, CancellationToken.None));
    }
}

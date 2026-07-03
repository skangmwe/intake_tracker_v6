// Publishes event-spine envelopes to Service Bus for cross-service consumers.

using McDermott.AiTracker.Api.Shared.EventSpine;

namespace McDermott.AiTracker.Api.Shared.Messaging;

public interface IServiceBusPublisher
{
    /// <summary>
    /// Publish one envelope to the event-spine topic. No-ops when Service Bus is not
    /// configured (local/dev). Retry/throttling is handled by the Azure SDK
    /// (api-performance.md — outbound throttling).
    /// </summary>
    Task PublishAsync(EventEnvelope envelope, CancellationToken ct);
}

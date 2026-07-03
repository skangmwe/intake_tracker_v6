// Non-secret Service Bus configuration (api-secrets.md — namespace + topic name are
// non-secret; auth is Managed Identity, so there is no connection string to store).
// Bound from the "ServiceBus" configuration section.

namespace McDermott.AiTracker.Api.Shared.Messaging;

public sealed class ServiceBusOptions
{
    public const string SectionName = "ServiceBus";

    /// <summary>
    /// Fully-qualified namespace, e.g. "ai-tracker.servicebus.windows.net". When empty
    /// (local / dev), the publisher runs in no-op mode and does not attempt to connect.
    /// </summary>
    public string Namespace { get; set; } = string.Empty;

    /// <summary>Topic the event spine publishes to for cross-service consumers.</summary>
    public string TopicName { get; set; } = "event-spine";
}

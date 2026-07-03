// The event spine — the single emission layer for every state change (BS §11.1).
// Called exactly once per state change by the emitting module.
//
// On emit:
//   1. The audit row is written synchronously and durably (the same-request Audit
//      consumer). It runs on the caller's DbContext/transaction, so audit commits
//      atomically with the state change.
//   2. The envelope is published to Service Bus for the cross-service consumers
//      (Mirror, Notifications, Dashboards) — those land in later slices; publishing
//      is a no-op until Service Bus is configured.
//
// Audit is written before publish so the durable record exists before fan-out. If
// publish fails hard after the SDK's retries, the exception propagates and the
// caller's transaction unwinds the audit row too — the whole state change is atomic.

using McDermott.AiTracker.Api.Shared.Messaging;

namespace McDermott.AiTracker.Api.Shared.EventSpine;

public sealed class EventSpine : IEventSpine
{
    private readonly IAuditWriter _auditWriter;
    private readonly IServiceBusPublisher _publisher;

    public EventSpine(IAuditWriter auditWriter, IServiceBusPublisher publisher)
    {
        _auditWriter = auditWriter;
        _publisher = publisher;
    }

    public async Task EmitAsync(EventEnvelope envelope, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(envelope);
        ct.ThrowIfCancellationRequested();

        await _auditWriter.WriteAsync(envelope, ct).ConfigureAwait(false);
        await _publisher.PublishAsync(envelope, ct).ConfigureAwait(false);
    }
}

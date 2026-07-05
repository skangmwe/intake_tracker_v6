// The event spine — the single emission layer for every state change (BS §11.1).
// Called exactly once per state change by the emitting module.
//
// On emit, the in-process consumers run in order on the caller's DbContext/transaction, then the
// envelope is published to Service Bus for the cross-service consumers:
//   1. Audit row — written synchronously and durably (the same-request Audit consumer), so audit
//      commits atomically with the state change.
//   2. Notification fan-out (slice 12) — usp_FanOutNotification materialises per-user bell rows,
//      also on the caller's transaction, so notifications commit atomically too. A no-op for
//      non-notifiable events. This is the dev/prod mechanism: the Worker/Service-Bus consumer stays
//      documented but is a no-op until the namespace is configured (same pattern as slice 9's mirror).
//   3. Service Bus publish — for the remaining cross-service consumers (Mirror, Dashboards); a no-op
//      until Service Bus is configured.
//
// Audit is written before fan-out and publish so the durable record exists first. If any step fails
// hard after the SDK's retries, the exception propagates and the caller's transaction unwinds every
// row written this emit — the whole state change is atomic.

using McDermott.AiTracker.Api.Shared.Messaging;

namespace McDermott.AiTracker.Api.Shared.EventSpine;

public sealed class EventSpine : IEventSpine
{
    private readonly IAuditWriter _auditWriter;
    private readonly INotificationFanout _notificationFanout;
    private readonly IServiceBusPublisher _publisher;

    public EventSpine(IAuditWriter auditWriter, INotificationFanout notificationFanout, IServiceBusPublisher publisher)
    {
        _auditWriter = auditWriter;
        _notificationFanout = notificationFanout;
        _publisher = publisher;
    }

    public async Task EmitAsync(EventEnvelope envelope, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(envelope);
        ct.ThrowIfCancellationRequested();

        await _auditWriter.WriteAsync(envelope, ct).ConfigureAwait(false);
        await _notificationFanout.FanOutAsync(envelope, ct).ConfigureAwait(false);
        await _publisher.PublishAsync(envelope, ct).ConfigureAwait(false);
    }
}

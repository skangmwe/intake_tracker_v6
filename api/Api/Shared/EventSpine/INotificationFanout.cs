// Same-request Notifications consumer of the event spine (slice 12). Materialises per-user bell
// notifications from an event via usp_FanOutNotification. Kept behind an interface so the emitter
// is unit-testable without a database (mirrors IAuditWriter).

namespace McDermott.AiTracker.Api.Shared.EventSpine;

public interface INotificationFanout
{
    /// <summary>Fan one event out to its notification targets. A no-op for non-notifiable events.</summary>
    Task FanOutAsync(EventEnvelope envelope, CancellationToken ct);
}

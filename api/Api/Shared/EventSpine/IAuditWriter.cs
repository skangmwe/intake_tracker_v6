// Same-request audit consumer of the event spine — persists the append-only audit
// row via usp_EmitAuditEntry. Kept behind an interface so the emitter is unit-testable
// without a database.

namespace McDermott.AiTracker.Api.Shared.EventSpine;

public interface IAuditWriter
{
    /// <summary>Append one immutable audit row for the given envelope.</summary>
    Task WriteAsync(EventEnvelope envelope, CancellationToken ct);
}

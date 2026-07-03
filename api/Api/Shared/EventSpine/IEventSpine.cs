// Event spine interface — single emission layer feeding audit, mirror, notifications, dashboards.

namespace McDermott.AiTracker.Api.Shared.EventSpine;

public interface IEventSpine
{
    /// <summary>Emit an event on the spine. Called exactly once per state change.</summary>
    Task EmitAsync(EventEnvelope envelope, CancellationToken ct);
}

/// <summary>The envelope every emitter constructs. Payload is opaque JSON — the emitter's contract.</summary>
public sealed record EventEnvelope(
    Guid EventId,
    string EventType,
    Guid WorkspaceId,
    string? RecordId,
    Guid? ActorUserId,
    DateTimeOffset EventAt,
    string PayloadJson,
    string OperationId);

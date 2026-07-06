// Wire contracts for the Audit module (Slice 18 — api-contracts.md §18, S33). Property names serialize
// to camelCase (ASP.NET Core web defaults) so they mirror the audit types in /shared/types/audit.ts.
// The audit log is a read-only projection of the append-only dbo.AuditEntry — there is no write path
// here (that is the event spine's AuditWriter, slice 1).

using System.ComponentModel.DataAnnotations;

namespace McDermott.AiTracker.Api.Modules.Audit;

/// <summary>One workspace-audit-log row (mirrors AuditLogRowDto in audit.ts). Actor id/name are null
/// for system-generated events; record id / object type are null for workspace-level or config
/// events. <c>Payload</c> is the already-sanitised structured JSON the UI shapes per event type.</summary>
public sealed record AuditLogRowResponse(
    Guid AuditId,
    Guid WorkspaceId,
    string? RecordId,
    string? ObjectType,
    string EventType,
    Guid? ActorUserId,
    string? ActorName,
    DateTime EventAt,
    string Payload);

/// <summary>POST /workspaces/{id}/audit/query body (mirrors AuditLogQuery in audit.ts). The workspace
/// comes from the route; every filter below is optional and ANDs with the others. Paginated (default
/// 20, max 100 — api/CLAUDE.md; over-100 is rejected 400, never clamped).</summary>
public sealed class AuditLogQueryRequest
{
    /// <summary>Inclusive lower bound on the event date (date-only; treated as start-of-day UTC).</summary>
    public DateOnly? DateFrom { get; set; }

    /// <summary>Inclusive upper bound on the event date (date-only; treated as end-of-day UTC).</summary>
    public DateOnly? DateTo { get; set; }

    /// <summary>Restrict to events by one actor.</summary>
    public Guid? ActorUserId { get; set; }

    /// <summary>Restrict to events on one record.</summary>
    [MaxLength(20)]
    public string? RecordId { get; set; }

    /// <summary>Restrict to one event type.</summary>
    [MaxLength(64)]
    public string? EventType { get; set; }

    [Range(1, int.MaxValue)]
    public int Page { get; set; } = 1;

    [Range(1, int.MaxValue)]
    public int PageSize { get; set; } = 20;
}

// Wire contracts for the Escalation module (Slice 9 — api-contracts.md §4). Property names serialize
// to camelCase (ASP.NET Core web defaults) so they mirror /shared/types/requests.ts exactly.

using McDermott.AiTracker.Api.Modules.Requests;

namespace McDermott.AiTracker.Api.Modules.Escalation;

/// <summary>
/// POST /requests/{id}/escalate body. <c>ConfirmPendingEdits</c> is the confirm-and-lock
/// acknowledgement (BS §6.3) — the API can't see unsaved client edits, so the modal sets it true
/// on confirm; a false value returns 400 pending-crossing-edits.
/// </summary>
public sealed record EscalateRequest(bool ConfirmPendingEdits);

/// <summary>
/// 201 response. <c>AiRecord</c> is present only when the escalator is also a member of the AI
/// Solutions workspace; a PG-only escalator (the common case) cannot see the AI record (BS §6.4),
/// so it is null and the PG UI refetches the now-escalated PG record to render the bridge.
/// </summary>
public sealed record EscalateResult(string RecordId, Guid AiWorkspaceId, RequestDto? AiRecord);

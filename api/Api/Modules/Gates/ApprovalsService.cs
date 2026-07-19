// Gates / Approvals service (Slice 8 — api-contracts.md §6, BS §7.2 / §7.3). Owns the ApprovalRequest
// lifecycle: opening a gate on a gated stage advance (called from RequestsService.SetStageAsync),
// reading a record's gates, and recording slot decisions / re-requests. Access is gated through the
// parent record on the caller's side (usp_GetRequestByIdForUser for reads; a membership + level join
// inside each write proc) — a forbidden OR non-existent record resolves to null / no rows → 403,
// never 404 (BS §22.6). Rejection comments and approver display names are Confidential — never logged;
// event payloads carry ids / enums only (api-pii-handling.md). Every state change emits exactly one
// event on the spine (plus request.stage-changed when a gate resolves and advances the record).

using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Gates;

/// <summary>Result of opening a gate on a stage advance.</summary>
public enum GateOpenOutcome
{
    Opened,
    AlreadyOpen,
    Forbidden,
}

public sealed record GateOpenResult(GateOpenOutcome Outcome, ApprovalRequestDto? Request = null);

/// <summary>Result of a decision / re-request — the controller maps it to a status code.</summary>
public enum ApprovalDecisionOutcome
{
    Success,
    Forbidden,
    RejectionNeedsComment,
    Ineligible,
    UnknownSlot,
    AlreadyResolved,
    Invalid,
    /// <summary>Slice 26 — parent record is <c>OnHold</c> or <c>Abandoned</c>; approval blocked (409 record-on-hold).</summary>
    RecordOnHold,
}

public sealed record ApprovalDecisionResult(ApprovalDecisionOutcome Outcome, ApprovalRequestDto? Request = null);

public interface IApprovalsService
{
    /// <summary>The GateDefinition guarding current-stage → toStage on the record's lifecycle, or null when ungated.</summary>
    Task<Guid?> FindGateForTransitionAsync(
        string recordId, Guid workspaceId, string toStage, CancellationToken cancellationToken);

    /// <summary>Open a gate — freeze slots + eligible members, emit gate.opened. AlreadyOpen → 409.</summary>
    Task<GateOpenResult> OpenGateAsync(
        string recordId, Guid workspaceId, Guid gateDefinitionId, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    /// <summary>A record's gates. Returns null when the caller cannot see the record (→ 403).</summary>
    Task<IReadOnlyList<ApprovalRequestDto>?> GetForRecordAsync(
        string recordId, Guid userId, CancellationToken cancellationToken);

    /// <summary>Record an Approve/Reject decision on a slot (isProxy = admin off-platform sign-off).</summary>
    Task<ApprovalDecisionResult> SubmitDecisionAsync(
        Guid approvalRequestId, ApprovalDecisionRequest request, Guid actorUserId, bool isProxy, string operationId, CancellationToken cancellationToken);

    /// <summary>Return a rejected slot to Pending so it can be signed again.</summary>
    Task<ApprovalDecisionResult> ReRequestAsync(
        Guid approvalRequestId, int slotIndex, Guid actorUserId, string operationId, CancellationToken cancellationToken);
}

public sealed class ApprovalsService : IApprovalsService
{
    // Guard numbers raised by the gate procs (mapped to API outcomes).
    private const int GateAlreadyOpenError = 50051;         // usp_OpenGate → 409 gate-already-open.
    private const int RejectionNeedsCommentError = 50053;   // → 400 rejection-requires-comment.
    private const int GateAlreadyResolvedError = 50055;     // → 409.
    private const int UnknownSlotError = 50056;             // → 400.
    private const int IneligibleSignerError = 50057;        // → 400.
    private const int BadDecisionError = 50058;             // → 400 (defence in depth; API validates first).
    // Slice 26: raised by usp_SubmitDecision when the parent record is OnHold / Abandoned.
    private const int RecordOnHoldError = Requests.RequestsService.RecordOnHoldError;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly IEventSpine _eventSpine;
    private readonly IClock _clock;

    public ApprovalsService(AppDbContext db, IEventSpine eventSpine, IClock clock)
    {
        _db = db;
        _eventSpine = eventSpine;
        _clock = clock;
    }

    public async Task<Guid?> FindGateForTransitionAsync(
        string recordId, Guid workspaceId, string toStage, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<GateForTransitionRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetGateForTransition @RecordId, @WorkspaceId, @ToStage",
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@ToStage", toStage))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return rows.FirstOrDefault()?.GateDefinitionId;
    }

    public async Task<GateOpenResult> OpenGateAsync(
        string recordId, Guid workspaceId, Guid gateDefinitionId, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        try
        {
            var rows = await _db.Set<ApprovalRequestRow>()
                .FromSqlRaw(
                    "EXEC dbo.usp_OpenGate @RecordId, @WorkspaceId, @GateDefinitionId, @OpenedByUserId",
                    new SqlParameter("@RecordId", recordId),
                    new SqlParameter("@WorkspaceId", workspaceId),
                    new SqlParameter("@GateDefinitionId", gateDefinitionId),
                    new SqlParameter("@OpenedByUserId", actorUserId))
                .ToListAsync(cancellationToken).ConfigureAwait(false);

            var row = rows.FirstOrDefault();
            if (row is null)
            {
                return new GateOpenResult(GateOpenOutcome.Forbidden);
            }

            await EmitAsync("gate.opened", row.WorkspaceId, row.RequestRecordId, actorUserId,
                new { approvalRequestId = row.ApprovalRequestId, gateDefinitionId }, operationId, cancellationToken).ConfigureAwait(false);

            return new GateOpenResult(GateOpenOutcome.Opened, MapApproval(row));
        }
        catch (SqlException ex) when (ex.Number == GateAlreadyOpenError)
        {
            return new GateOpenResult(GateOpenOutcome.AlreadyOpen);
        }
    }

    public async Task<IReadOnlyList<ApprovalRequestDto>?> GetForRecordAsync(
        string recordId, Guid userId, CancellationToken cancellationToken)
    {
        // Gate the parent record first so a forbidden record is a 403, not an empty 200 (BS §22.6).
        var record = await ReadRecordAsync(recordId, userId, cancellationToken).ConfigureAwait(false);
        if (record is null)
        {
            return null;
        }

        var rows = await _db.Set<ApprovalRequestRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetApprovalRequestsForRecord @RecordId, @UserId",
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return rows.Select(MapApproval).ToList();
    }

    public async Task<ApprovalDecisionResult> SubmitDecisionAsync(
        Guid approvalRequestId, ApprovalDecisionRequest request, Guid actorUserId, bool isProxy, string operationId, CancellationToken cancellationToken)
    {
        // Comment is required on a rejection — return 400 before touching the proc (the DB CHECK is a backstop).
        if (string.Equals(request.Decision, "Rejected", StringComparison.Ordinal) && string.IsNullOrWhiteSpace(request.Comment))
        {
            return new ApprovalDecisionResult(ApprovalDecisionOutcome.RejectionNeedsComment);
        }

        try
        {
            var rows = await _db.Set<ApprovalRequestRow>()
                .FromSqlRaw(
                    "EXEC dbo.usp_SubmitDecision @ApprovalRequestId, @UserId, @SlotIndex, @DecidedByUserId, @Decision, @Comment, @IsProxy",
                    new SqlParameter("@ApprovalRequestId", approvalRequestId),
                    new SqlParameter("@UserId", actorUserId),
                    new SqlParameter("@SlotIndex", request.SlotIndex),
                    new SqlParameter("@DecidedByUserId", request.DecidedByUserId),
                    new SqlParameter("@Decision", request.Decision!),
                    new SqlParameter("@Comment", (object?)request.Comment ?? DBNull.Value),
                    new SqlParameter("@IsProxy", isProxy))
                .ToListAsync(cancellationToken).ConfigureAwait(false);

            var row = rows.FirstOrDefault();
            if (row is null)
            {
                return new ApprovalDecisionResult(ApprovalDecisionOutcome.Forbidden);
            }

            // Comment stays out of the payload (Confidential). decidedByUserId is the Entra oid (audit-safe).
            await EmitAsync("gate.decided", row.WorkspaceId, row.RequestRecordId, actorUserId,
                new
                {
                    approvalRequestId = row.ApprovalRequestId,
                    slotIndex = request.SlotIndex,
                    decision = request.Decision,
                    signerUserId = request.DecidedByUserId,
                    state = row.State,
                    isProxy,
                },
                operationId, cancellationToken).ConfigureAwait(false);

            if (string.Equals(row.State, "Resolved", StringComparison.Ordinal))
            {
                await EmitAsync("request.stage-changed", row.WorkspaceId, row.RequestRecordId, actorUserId,
                    new { toStage = row.ToStageKey, viaGate = true }, operationId, cancellationToken).ConfigureAwait(false);
            }

            return new ApprovalDecisionResult(ApprovalDecisionOutcome.Success, MapApproval(row));
        }
        catch (SqlException ex) when (ex.Number == RejectionNeedsCommentError)
        {
            return new ApprovalDecisionResult(ApprovalDecisionOutcome.RejectionNeedsComment);
        }
        catch (SqlException ex) when (ex.Number == IneligibleSignerError)
        {
            return new ApprovalDecisionResult(ApprovalDecisionOutcome.Ineligible);
        }
        catch (SqlException ex) when (ex.Number == UnknownSlotError)
        {
            return new ApprovalDecisionResult(ApprovalDecisionOutcome.UnknownSlot);
        }
        catch (SqlException ex) when (ex.Number == GateAlreadyResolvedError)
        {
            return new ApprovalDecisionResult(ApprovalDecisionOutcome.AlreadyResolved);
        }
        catch (SqlException ex) when (ex.Number == RecordOnHoldError)
        {
            return new ApprovalDecisionResult(ApprovalDecisionOutcome.RecordOnHold);
        }
        catch (SqlException ex) when (ex.Number == BadDecisionError)
        {
            return new ApprovalDecisionResult(ApprovalDecisionOutcome.Invalid);
        }
    }

    public async Task<ApprovalDecisionResult> ReRequestAsync(
        Guid approvalRequestId, int slotIndex, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        try
        {
            var rows = await _db.Set<ApprovalRequestRow>()
                .FromSqlRaw(
                    "EXEC dbo.usp_ReRequestApproval @ApprovalRequestId, @UserId, @SlotIndex",
                    new SqlParameter("@ApprovalRequestId", approvalRequestId),
                    new SqlParameter("@UserId", actorUserId),
                    new SqlParameter("@SlotIndex", slotIndex))
                .ToListAsync(cancellationToken).ConfigureAwait(false);

            var row = rows.FirstOrDefault();
            if (row is null)
            {
                return new ApprovalDecisionResult(ApprovalDecisionOutcome.Forbidden);
            }

            await EmitAsync("gate.decided", row.WorkspaceId, row.RequestRecordId, actorUserId,
                new { approvalRequestId = row.ApprovalRequestId, slotIndex, action = "re-request", state = row.State },
                operationId, cancellationToken).ConfigureAwait(false);

            return new ApprovalDecisionResult(ApprovalDecisionOutcome.Success, MapApproval(row));
        }
        catch (SqlException ex) when (ex.Number == GateAlreadyResolvedError)
        {
            return new ApprovalDecisionResult(ApprovalDecisionOutcome.AlreadyResolved);
        }
    }

    // ─── Mapping ───────────────────────────────────────────────────────────────

    private static ApprovalRequestDto MapApproval(ApprovalRequestRow row) => new(
        Id: row.ApprovalRequestId.ToString(),
        RequestRecordId: row.RequestRecordId,
        GateDefinitionId: row.GateDefinitionId.ToString(),
        GateName: row.GateName,
        FromStage: row.FromStageLabel,
        ToStage: row.ToStageLabel,
        State: row.State,
        OpenedAt: DateTime.SpecifyKind(row.OpenedAt, DateTimeKind.Utc),
        ResolvedAt: row.ResolvedAt is null ? null : DateTime.SpecifyKind(row.ResolvedAt.Value, DateTimeKind.Utc),
        Slots: ParseJson<FrozenApproverSlotDto>(row.FrozenApproverSet),
        Decisions: ParseJson<ApprovalDecisionDto>(row.DecisionsJson));

    /// <summary>Parse a FrozenApproverSet / DecisionsJson column into its DTO list (empty on malformed).</summary>
    public static IReadOnlyList<T> ParseJson<T>(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return Array.Empty<T>();
        }

        try
        {
            return JsonSerializer.Deserialize<List<T>>(json, JsonOptions) ?? new List<T>();
        }
        catch (JsonException)
        {
            return Array.Empty<T>();
        }
    }

    private async Task<RequestRow?> ReadRecordAsync(string recordId, Guid userId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<RequestRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetRequestByIdForUser @RecordId, @UserId",
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return rows.FirstOrDefault();
    }

    private async Task EmitAsync(
        string eventType, Guid workspaceId, string recordId, Guid actorUserId, object payloadObject, string operationId, CancellationToken cancellationToken)
    {
        var payload = JsonSerializer.Serialize(payloadObject, JsonOptions);
        var envelope = new EventEnvelope(
            Guid.NewGuid(), eventType, workspaceId, recordId, actorUserId, _clock.UtcNow, payload, operationId);
        await _eventSpine.EmitAsync(envelope, cancellationToken).ConfigureAwait(false);
    }
}

// Requests core service (Slice 5 — api-contracts.md §3). Owns create / detail / list / patch /
// stage / hold. Every mutation goes through a stored procedure (mint + origin, optimistic-
// concurrency PATCH, whitelisted-sort list → api-data-access.md), with each dynamic value bound as
// a SqlParameter (never string-built). Record-scoped mutations resolve the record via
// usp_GetRequestByIdForUser (membership baked into the proc) and then require Member+ on that
// workspace — an inaccessible or non-existent record is denied uniformly (403, never 404 — the API
// never discloses existence, BS §22.6). Each successful change emits exactly one event on the
// spine; event payloads carry ids/enums only — never field values, names, or descriptions
// (api-pii-handling.md). Read/serialization/validation helpers live in RequestsService.Reads.cs.

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Gates;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Escalation;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Requests;

/// <summary>Outcome of a create/patch/hold write.</summary>
public enum RequestWriteOutcome
{
    Success,
    ValidationFailed,
    Denied,
    Stale,
    /// <summary>The patch targets a locked field — a PG-side crossing field on an escalated record, or a
    /// platform-defined field (AI Solutions Status / system fields). 403 (BS §6.2/§6.4).</summary>
    Locked,
    /// <summary>Slice 26 — the record is <c>OnHold</c> or <c>Abandoned</c> and this mutation is blocked (409 record-on-hold).</summary>
    RecordOnHold,
}

/// <summary>Outcome of a stage move.</summary>
public enum StageMoveOutcome
{
    Success,
    InvalidStage,
    Denied,
    /// <summary>The transition is gated — an ApprovalRequest opened instead of advancing (200 with the gate).</summary>
    GateOpened,
    /// <summary>A gate is already open on this record — 409 gate-already-open.</summary>
    GateAlreadyOpen,
    /// <summary>Slice 26 — the record is <c>OnHold</c> or <c>Abandoned</c> and stage advance is blocked (409 record-on-hold).</summary>
    RecordOnHold,
}

public sealed record RequestCreateResult(
    RequestWriteOutcome Outcome,
    RequestDto? Request = null,
    IReadOnlyDictionary<string, string[]>? Errors = null);

public sealed record RequestPatchResult(RequestWriteOutcome Outcome, RequestDto? Request = null);

public sealed record StageMoveResult(StageMoveOutcome Outcome, StageTransitionResultDto? Result = null);

public interface IRequestsService
{
    Task<RequestCreateResult> CreateAsync(
        Guid workspaceId, RequestCreateRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    Task<PaginatedResponse<RequestListRow>> QueryAsync(
        Guid workspaceId, PaginatedQuery query, CancellationToken cancellationToken);

    /// <summary>Intake similar-requests nudge — up to `top` access-respecting matches (BS §9.8).</summary>
    Task<IReadOnlyList<SimilarRequestDto>> FindSimilarAsync(
        Guid workspaceId, Guid userId, string? query, int top, CancellationToken cancellationToken);

    Task<RequestDto?> GetByIdAsync(string recordId, Guid userId, CancellationToken cancellationToken);

    Task<RequestPatchResult> PatchAsync(
        string recordId, RequestPatchRequest request, string? ifMatch, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    Task<StageMoveResult> SetStageAsync(
        string recordId, string toStage, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    Task<RequestWriteOutcome> SetHoldAsync(
        string recordId, bool held, string? reason, Guid actorUserId, string operationId, CancellationToken cancellationToken);
}

public sealed partial class RequestsService : IRequestsService
{
    // Guard numbers raised by the request procs.
    private const int StaleRecordError = 50040;   // usp_PatchRequest — If-Match mismatch → 409.
    private const int InvalidStageError = 50041;   // usp_SetRequestStage — stage not on lifecycle → 400.
    private const int NotFoundError = 50043;       // request row not found → 403 (never disclose).
    // Slice 26: raised by usp_PatchTask / usp_SubmitDecision / usp_SetRequestStage when the record is
    // OnHold or Abandoned. Both states share this code — the UI distinguishes via the DTO's statusHold.
    internal const int RecordOnHoldError = 51201;

    private readonly AppDbContext _db;
    private readonly IAccessGuard _accessGuard;
    private readonly IEventSpine _eventSpine;
    private readonly IClock _clock;
    private readonly IApprovalsService _approvals;
    private readonly IBridgeReader _bridge;

    public RequestsService(
        AppDbContext db, IAccessGuard accessGuard, IEventSpine eventSpine, IClock clock,
        IApprovalsService approvals, IBridgeReader bridge)
    {
        _db = db;
        _accessGuard = accessGuard;
        _eventSpine = eventSpine;
        _clock = clock;
        _approvals = approvals;
        _bridge = bridge;
    }

    public async Task<RequestCreateResult> CreateAsync(
        Guid workspaceId, RequestCreateRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var errors = ValidateCreate(request);
        if (errors.Count > 0)
        {
            return new RequestCreateResult(RequestWriteOutcome.ValidationFailed, Errors: errors);
        }

        // Resolve the lifecycle: match the chosen request type, else the workspace default, else first.
        var lifecycles = await ReadLifecyclesAsync(workspaceId, cancellationToken).ConfigureAwait(false);
        if (lifecycles.Count == 0)
        {
            return NoLifecycle("This workspace has no lifecycle configured.");
        }

        var requestType = GetString(request.Fields, "requestType");
        var chosen =
            (requestType is not null
                ? lifecycles.FirstOrDefault(lifecycle => string.Equals(lifecycle.RequestType, requestType, StringComparison.OrdinalIgnoreCase))
                : null)
            ?? lifecycles.FirstOrDefault(lifecycle => lifecycle.IsDefault)
            ?? lifecycles[0];

        var stages = (await ReadStagesAsync(workspaceId, cancellationToken).ConfigureAwait(false))
            .Where(stage => stage.LifecycleId == chosen.LifecycleId)
            .OrderBy(stage => stage.SortOrder)
            .ToList();
        if (stages.Count == 0)
        {
            return NoLifecycle("The selected lifecycle has no stages configured.");
        }

        var initialStage = stages[0].StageKey;
        var recordIdParameter = new SqlParameter("@RecordId", System.Data.SqlDbType.NVarChar, 20)
        {
            Direction = System.Data.ParameterDirection.Output,
        };

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_CreateRequest @WorkspaceId, @LifecycleId, @Stage, @Name, @Description, @FieldValuesJson, @ActorUserId, @RecordId OUTPUT, @QueuedLinksJson",
            new[]
            {
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@LifecycleId", chosen.LifecycleId),
                new SqlParameter("@Stage", initialStage),
                new SqlParameter("@Name", request.Name),
                new SqlParameter("@Description", (object?)request.Description ?? string.Empty),
                new SqlParameter("@FieldValuesJson", SerializeFields(request.Fields)),
                new SqlParameter("@ActorUserId", actorUserId.ToString()),
                recordIdParameter,
                // Queued link-backs (similar-requests nudge + Copy/Promote) are stamped in-transaction
                // as typed links (best-effort — a non-existent target is skipped, never fails create).
                new SqlParameter("@QueuedLinksJson", (object?)BuildQueuedLinksJson(request) ?? DBNull.Value),
            },
            cancellationToken).ConfigureAwait(false);

        var recordId = (string)recordIdParameter.Value!;

        await EmitAsync(
            "request.created", workspaceId, recordId, actorUserId,
            new { lifecycleId = chosen.LifecycleId, stage = initialStage }, operationId, cancellationToken).ConfigureAwait(false);

        var dto = await ReadAndMapAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        return new RequestCreateResult(RequestWriteOutcome.Success, dto);
    }

    public async Task<RequestDto?> GetByIdAsync(string recordId, Guid userId, CancellationToken cancellationToken) =>
        await ReadAndMapAsync(recordId, userId, cancellationToken).ConfigureAwait(false);

    public async Task<RequestPatchResult> PatchAsync(
        string recordId, RequestPatchRequest request, string? ifMatch, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var row = await ReadRowAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (row is null || !await _accessGuard.HasWorkspaceLevelAsync(actorUserId, row.WorkspaceId, WorkspaceLevel.Member, cancellationToken).ConfigureAwait(false))
        {
            return new RequestPatchResult(RequestWriteOutcome.Denied);
        }

        // Locked-field guard: platform-defined fields (AI Solutions Status / system fields) are never
        // writable, and PG-side crossing fields freeze once the record is escalated (BS §6.2/§6.4). A
        // patch that changes any locked field is 403 — defense in depth behind the read-only UI.
        if (await IsLockedFieldEditAsync(recordId, actorUserId, row, request, cancellationToken).ConfigureAwait(false))
        {
            return new RequestPatchResult(RequestWriteOutcome.Locked);
        }

        // A malformed or absent ETag can never match the stored RowVer — treat as a stale conflict.
        if (!TryDecodeRowVer(ifMatch, out var rowVer))
        {
            return new RequestPatchResult(RequestWriteOutcome.Stale);
        }

        // Slice 26 — statusHold routes through its own proc (JSON mirror + column update). Legacy
        // `hold` maps: held=true → OnHold, held=false → InProgress. When both are present, statusHold
        // wins (writers upgrading from the legacy shape may temporarily send both). Content-field
        // patches remain served by usp_PatchRequest; the two writes are sequential — status/hold first
        // so a same-request Abandoned+field-edit is safely blocked by the next mutation attempt.
        var resolvedStatusHold = ResolveStatusHold(request);
        var mergedFields = MergeFields(ParseFields(row.FieldValues), request.Fields);
        var hasFieldPatch = request.Name is not null
                           || request.Description is not null
                           || request.Fields is { Count: > 0 };
        var name = request.Name ?? row.Name;
        var description = request.Description ?? row.Description;

        try
        {
            if (resolvedStatusHold is { } statusHoldValue)
            {
                await _db.Database.ExecuteSqlRawAsync(
                    "EXEC dbo.usp_UpsertRequestStatusHold @RecordId, @WorkspaceId, @StatusHold, @Note, @ActorUserId",
                    new[]
                    {
                        new SqlParameter("@RecordId", recordId),
                        new SqlParameter("@WorkspaceId", row.WorkspaceId),
                        new SqlParameter("@StatusHold", statusHoldValue.ToString()),
                        new SqlParameter("@Note", (object?)request.StatusHoldNote ?? DBNull.Value),
                        new SqlParameter("@ActorUserId", actorUserId.ToString()),
                    },
                    cancellationToken).ConfigureAwait(false);

                await EmitAsync(
                    "request.status-hold-changed", row.WorkspaceId, recordId, actorUserId,
                    new { statusHold = statusHoldValue.ToString() }, operationId, cancellationToken)
                    .ConfigureAwait(false);
            }

            if (hasFieldPatch)
            {
                await _db.Database.ExecuteSqlRawAsync(
                    "EXEC dbo.usp_PatchRequest @RecordId, @WorkspaceId, @Name, @Description, @FieldValuesJson, @IfMatchRowVer, @ActorUserId",
                    new[]
                    {
                        new SqlParameter("@RecordId", recordId),
                        new SqlParameter("@WorkspaceId", row.WorkspaceId),
                        new SqlParameter("@Name", name),
                        new SqlParameter("@Description", (object?)description ?? string.Empty),
                        new SqlParameter("@FieldValuesJson", SerializeFieldsDictionary(mergedFields)),
                        new SqlParameter("@IfMatchRowVer", System.Data.SqlDbType.VarBinary, 8) { Value = rowVer },
                        new SqlParameter("@ActorUserId", actorUserId.ToString()),
                    },
                    cancellationToken).ConfigureAwait(false);
            }
        }
        catch (SqlException ex) when (ex.Number == StaleRecordError)
        {
            return new RequestPatchResult(RequestWriteOutcome.Stale);
        }
        catch (SqlException ex) when (ex.Number == NotFoundError)
        {
            return new RequestPatchResult(RequestWriteOutcome.Denied);
        }

        if (hasFieldPatch)
        {
            await EmitAsync("request.updated", row.WorkspaceId, recordId, actorUserId, new { }, operationId, cancellationToken).ConfigureAwait(false);
        }
        var dto = await ReadAndMapAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        return new RequestPatchResult(RequestWriteOutcome.Success, dto);
    }

    /// <summary>
    /// Slice 26 — resolve the desired statusHold from the sparse patch. Preference order: explicit
    /// <c>StatusHold</c> wins; otherwise the legacy <c>Hold</c> shape is mapped
    /// (<c>held=true → OnHold</c>, <c>held=false → InProgress</c>); otherwise null (no change).
    /// Pure — unit-testable.
    /// </summary>
    public static RequestStatusHoldValue? ResolveStatusHold(RequestPatchRequest request)
    {
        if (request.StatusHold is { } explicitValue)
        {
            return explicitValue;
        }

        if (request.Hold is { } legacy)
        {
            return legacy.Held ? RequestStatusHoldValue.OnHold : RequestStatusHoldValue.InProgress;
        }

        return null;
    }

    public async Task<StageMoveResult> SetStageAsync(
        string recordId, string toStage, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var row = await ReadRowAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (row is null || !await _accessGuard.HasWorkspaceLevelAsync(actorUserId, row.WorkspaceId, WorkspaceLevel.Member, cancellationToken).ConfigureAwait(false))
        {
            return new StageMoveResult(StageMoveOutcome.Denied);
        }

        // If this transition is gated (slice 8), open the gate instead of advancing — the record
        // advances only once every approver slot is signed (ApprovalsService resolves + advances).
        var gateDefinitionId = await _approvals
            .FindGateForTransitionAsync(recordId, row.WorkspaceId, toStage, cancellationToken).ConfigureAwait(false);
        if (gateDefinitionId is { } gateId)
        {
            var open = await _approvals
                .OpenGateAsync(recordId, row.WorkspaceId, gateId, actorUserId, operationId, cancellationToken).ConfigureAwait(false);
            return open.Outcome switch
            {
                GateOpenOutcome.Opened => new StageMoveResult(
                    StageMoveOutcome.GateOpened, new StageTransitionResultDto(false, GateOpened: open.Request)),
                GateOpenOutcome.AlreadyOpen => new StageMoveResult(StageMoveOutcome.GateAlreadyOpen),
                _ => new StageMoveResult(StageMoveOutcome.Denied),
            };
        }

        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_SetRequestStage @RecordId, @WorkspaceId, @ToStage, @ActorUserId",
                new[]
                {
                    new SqlParameter("@RecordId", recordId),
                    new SqlParameter("@WorkspaceId", row.WorkspaceId),
                    new SqlParameter("@ToStage", toStage),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()),
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException ex) when (ex.Number == InvalidStageError)
        {
            return new StageMoveResult(StageMoveOutcome.InvalidStage);
        }
        catch (SqlException ex) when (ex.Number == RecordOnHoldError)
        {
            return new StageMoveResult(StageMoveOutcome.RecordOnHold);
        }
        catch (SqlException ex) when (ex.Number == NotFoundError)
        {
            return new StageMoveResult(StageMoveOutcome.Denied);
        }

        await EmitAsync("request.stage-changed", row.WorkspaceId, recordId, actorUserId, new { toStage }, operationId, cancellationToken).ConfigureAwait(false);
        return new StageMoveResult(StageMoveOutcome.Success, new StageTransitionResultDto(true, toStage));
    }

    public async Task<RequestWriteOutcome> SetHoldAsync(
        string recordId, bool held, string? reason, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        // Slice 26 — legacy binary hold endpoint. Routes to usp_UpsertRequestStatusHold so column
        // + JSON mirror stay consistent. Preserved so pre-v2 clients keep working for one release.
        var row = await ReadRowAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (row is null || !await _accessGuard.HasWorkspaceLevelAsync(actorUserId, row.WorkspaceId, WorkspaceLevel.Member, cancellationToken).ConfigureAwait(false))
        {
            return RequestWriteOutcome.Denied;
        }

        var target = held ? RequestStatusHoldValue.OnHold : RequestStatusHoldValue.InProgress;

        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_UpsertRequestStatusHold @RecordId, @WorkspaceId, @StatusHold, @Note, @ActorUserId",
                new[]
                {
                    new SqlParameter("@RecordId", recordId),
                    new SqlParameter("@WorkspaceId", row.WorkspaceId),
                    new SqlParameter("@StatusHold", target.ToString()),
                    new SqlParameter("@Note", (object?)reason ?? DBNull.Value),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()),
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException ex) when (ex.Number == NotFoundError)
        {
            return RequestWriteOutcome.Denied;
        }

        await EmitAsync(
            "request.status-hold-changed", row.WorkspaceId, recordId, actorUserId,
            new { statusHold = target.ToString() }, operationId, cancellationToken).ConfigureAwait(false);
        return RequestWriteOutcome.Success;
    }

    private static RequestCreateResult NoLifecycle(string message) =>
        new(RequestWriteOutcome.ValidationFailed, Errors: new Dictionary<string, string[]> { ["lifecycle"] = new[] { message } });

    private async Task EmitAsync(
        string eventType, Guid workspaceId, string recordId, Guid actorUserId, object payloadObject, string operationId, CancellationToken cancellationToken)
    {
        var payload = System.Text.Json.JsonSerializer.Serialize(payloadObject, JsonOptions);
        var envelope = new EventEnvelope(
            Guid.NewGuid(), eventType, workspaceId, recordId, actorUserId, _clock.UtcNow, payload, operationId);
        await _eventSpine.EmitAsync(envelope, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// True when a patch attempts to change a locked field. Platform-defined keys (AI Solutions Status,
    /// system fields) are never writable. On the PG side of an escalated record, every frozen crossing
    /// field (name/description columns + the snapshotted content keys) is read-only; the AI side is not
    /// locked (its snapshot rows live under the PG workspace, so the bridge read reports no lock there).
    /// </summary>
    private async Task<bool> IsLockedFieldEditAsync(
        string recordId, Guid userId, RequestRow row, RequestPatchRequest request, CancellationToken cancellationToken)
    {
        // Platform-defined keys are locked regardless of escalation; the PG-side crossing keys are
        // locked only once escalated (and never on the AI side, whose snapshot rows live under the PG
        // workspace, so the bridge read reports no lock there). The comparison itself is pure + tested.
        var bridge = await _bridge.ReadAsync(recordId, userId, cancellationToken).ConfigureAwait(false);
        var lockedKeys = bridge is null || bridge.CallerOnAiSide
            ? Array.Empty<string>()
            : ParseLockedFieldKeys(bridge.LockedFieldKeysJson);

        return IsLockedFieldViolation(request, lockedKeys, row.Name, row.Description, ParseFields(row.FieldValues));
    }
}

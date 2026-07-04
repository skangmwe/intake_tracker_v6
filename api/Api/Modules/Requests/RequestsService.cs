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
using McDermott.AiTracker.Api.Shared.Auth;
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
}

/// <summary>Outcome of a stage move.</summary>
public enum StageMoveOutcome
{
    Success,
    InvalidStage,
    Denied,
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

    private readonly AppDbContext _db;
    private readonly IAccessGuard _accessGuard;
    private readonly IEventSpine _eventSpine;
    private readonly IClock _clock;

    public RequestsService(AppDbContext db, IAccessGuard accessGuard, IEventSpine eventSpine, IClock clock)
    {
        _db = db;
        _accessGuard = accessGuard;
        _eventSpine = eventSpine;
        _clock = clock;
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
            "EXEC dbo.usp_CreateRequest @WorkspaceId, @LifecycleId, @Stage, @Name, @Description, @FieldValuesJson, @ActorUserId, @RecordId OUTPUT",
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
            },
            cancellationToken).ConfigureAwait(false);

        var recordId = (string)recordIdParameter.Value!;

        // Queued related links are stamped as typed links in slice 10 — ignored here (never fail on them).
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

        // A malformed or absent ETag can never match the stored RowVer — treat as a stale conflict.
        if (!TryDecodeRowVer(ifMatch, out var rowVer))
        {
            return new RequestPatchResult(RequestWriteOutcome.Stale);
        }

        var mergedFields = MergeFields(ParseFields(row.FieldValues), request.Fields);
        var name = request.Name ?? row.Name;
        var description = request.Description ?? row.Description;

        try
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
        catch (SqlException ex) when (ex.Number == StaleRecordError)
        {
            return new RequestPatchResult(RequestWriteOutcome.Stale);
        }
        catch (SqlException ex) when (ex.Number == NotFoundError)
        {
            return new RequestPatchResult(RequestWriteOutcome.Denied);
        }

        await EmitAsync("request.updated", row.WorkspaceId, recordId, actorUserId, new { }, operationId, cancellationToken).ConfigureAwait(false);
        var dto = await ReadAndMapAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        return new RequestPatchResult(RequestWriteOutcome.Success, dto);
    }

    public async Task<StageMoveResult> SetStageAsync(
        string recordId, string toStage, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var row = await ReadRowAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (row is null || !await _accessGuard.HasWorkspaceLevelAsync(actorUserId, row.WorkspaceId, WorkspaceLevel.Member, cancellationToken).ConfigureAwait(false))
        {
            return new StageMoveResult(StageMoveOutcome.Denied);
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
        var row = await ReadRowAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (row is null || !await _accessGuard.HasWorkspaceLevelAsync(actorUserId, row.WorkspaceId, WorkspaceLevel.Member, cancellationToken).ConfigureAwait(false))
        {
            return RequestWriteOutcome.Denied;
        }

        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_SetRequestHold @RecordId, @WorkspaceId, @Held, @Reason, @ActorUserId",
                new[]
                {
                    new SqlParameter("@RecordId", recordId),
                    new SqlParameter("@WorkspaceId", row.WorkspaceId),
                    new SqlParameter("@Held", held),
                    new SqlParameter("@Reason", (object?)reason ?? DBNull.Value),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()),
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException ex) when (ex.Number == NotFoundError)
        {
            return RequestWriteOutcome.Denied;
        }

        await EmitAsync("request.hold-changed", row.WorkspaceId, recordId, actorUserId, new { held }, operationId, cancellationToken).ConfigureAwait(false);
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
}

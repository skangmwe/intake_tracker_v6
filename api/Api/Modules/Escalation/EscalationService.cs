// Escalation orchestrator (Slice 9 — the one-time, one-way bridge, BS §6). Reads the PG-side record
// (access baked into usp_GetRequestByIdForUser), validates required crossing fields, assembles the
// AI-side field map + the PG-side crossing snapshot in C# (the field schema is JSON, so JSON assembly
// lives here — mirroring RequestsService), then persists atomically through usp_EscalateRequest and
// emits exactly one escalation.opened event on the spine (audit on the PG side where the actor acted;
// the AI-Intake notification fan-out is slice 12). Field values / names are Confidential — never
// logged (api-pii-handling.md). The event payload carries ids only.

using System.Data;
using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Escalation;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Escalation;

public enum EscalateOutcome
{
    Success,
    Denied,
    AlreadyEscalated,
    PendingEdits,
    MissingRequired,
    /// <summary>The record already lives in the AI Solutions workspace — nothing to escalate.</summary>
    InvalidTarget,
}

public sealed record EscalateServiceResult(
    EscalateOutcome Outcome,
    EscalateResult? Result = null,
    IReadOnlyDictionary<string, string[]>? Errors = null);

public interface IEscalationService
{
    Task<EscalateServiceResult> EscalateAsync(
        string recordId, bool confirmPendingEdits, Guid actorUserId, string operationId, CancellationToken cancellationToken);
}

public sealed class EscalationService : IEscalationService
{
    // Guard numbers raised by usp_EscalateRequest.
    private const int AlreadyEscalatedError = 50044;
    private const int CannotEscalateAiRecordError = 50046;

    // A concurrent double-escalate can pass the proc's EXISTS pre-check and then lose the race on the
    // composite PK insert (2627) / unique index (2601). Data integrity holds (no second AI row); map
    // the loser to the same clean 409 as the pre-check rather than a 500.
    private static readonly int[] UniqueViolationErrors = { 2627, 2601 };

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly IRequestsService _requests;
    private readonly ICrossingMapReader _crossingMap;
    private readonly IAccessGuard _accessGuard;
    private readonly IEventSpine _eventSpine;
    private readonly IClock _clock;

    public EscalationService(
        AppDbContext db,
        IRequestsService requests,
        ICrossingMapReader crossingMap,
        IAccessGuard accessGuard,
        IEventSpine eventSpine,
        IClock clock)
    {
        _db = db;
        _requests = requests;
        _crossingMap = crossingMap;
        _accessGuard = accessGuard;
        _eventSpine = eventSpine;
        _clock = clock;
    }

    public async Task<EscalateServiceResult> EscalateAsync(
        string recordId, bool confirmPendingEdits, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        // Read the PG-side record on the caller's side — null means forbidden or non-existent (403,
        // never disclose existence). Escalation is a mutation, so require Member+ on that workspace.
        var pg = await _requests.GetByIdAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (pg is null
            || !await _accessGuard.HasWorkspaceLevelAsync(actorUserId, pg.WorkspaceId, WorkspaceLevel.Member, cancellationToken).ConfigureAwait(false))
        {
            return new EscalateServiceResult(EscalateOutcome.Denied);
        }

        // Already escalated (the bridge block is present) — one-time, one-way (BS §6.6).
        if (pg.Bridge is not null)
        {
            return new EscalateServiceResult(EscalateOutcome.AlreadyEscalated);
        }

        // Confirm-and-lock (BS §6.3): the modal acknowledges pending edits are committed.
        if (!confirmPendingEdits)
        {
            return new EscalateServiceResult(EscalateOutcome.PendingEdits);
        }

        var crossing = await _crossingMap.GetCrossingFieldsAsync(pg.WorkspaceId, cancellationToken).ConfigureAwait(false);

        var missing = new Dictionary<string, string[]>(StringComparer.Ordinal);
        foreach (var field in crossing.Where(candidate => candidate.IsRequired))
        {
            if (!TryReadCrossingValue(pg, field.FieldKey, out _, out _))
            {
                missing[field.FieldKey] = new[] { $"{field.DisplayName} is required before this record can be escalated." };
            }
        }

        if (missing.Count > 0)
        {
            return new EscalateServiceResult(EscalateOutcome.MissingRequired, Errors: missing);
        }

        // Assemble the AI-side field map (crossing values keyed by their AI target) + the PG-side
        // snapshot (every crossing value as raw JSON text). Name/Description ride as columns.
        var aiFields = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        var snapshots = new List<object>();
        foreach (var field in crossing)
        {
            if (!TryReadCrossingValue(pg, field.FieldKey, out var rawJson, out var element))
            {
                continue;
            }

            snapshots.Add(new { fieldKey = field.FieldKey, value = rawJson });

            if (field.FieldKey is "name" or "description")
            {
                continue; // columns on the AI row — the proc mirrors name; description is @Description.
            }

            var targetKey = string.IsNullOrWhiteSpace(field.CrossingToFieldKey) ? field.FieldKey : field.CrossingToFieldKey!;
            if (element is { } value)
            {
                aiFields[targetKey] = value;
            }
        }

        var aiWorkspaceParameter = new SqlParameter("@AiWorkspaceId", SqlDbType.UniqueIdentifier)
        {
            Direction = ParameterDirection.Output,
        };

        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_EscalateRequest @RecordId, @PgWorkspaceId, @Name, @Description, @AiFieldValuesJson, @SnapshotJson, @ActorUserId, @AiWorkspaceId OUTPUT",
                new[]
                {
                    new SqlParameter("@RecordId", recordId),
                    new SqlParameter("@PgWorkspaceId", pg.WorkspaceId),
                    new SqlParameter("@Name", pg.Name),
                    new SqlParameter("@Description", (object?)pg.Description ?? string.Empty),
                    new SqlParameter("@AiFieldValuesJson", JsonSerializer.Serialize(aiFields, JsonOptions)),
                    new SqlParameter("@SnapshotJson", JsonSerializer.Serialize(snapshots, JsonOptions)),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()),
                    aiWorkspaceParameter,
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException ex) when (ex.Number == AlreadyEscalatedError || UniqueViolationErrors.Contains(ex.Number))
        {
            return new EscalateServiceResult(EscalateOutcome.AlreadyEscalated);
        }
        catch (SqlException ex) when (ex.Number == CannotEscalateAiRecordError)
        {
            return new EscalateServiceResult(EscalateOutcome.InvalidTarget);
        }

        var aiWorkspaceId = (Guid)aiWorkspaceParameter.Value!;

        // One event on the spine: audit on the PG side (where the actor acted, so it lands in the PG
        // record's activity thread); the AI-Intake notification fan-out reads it in slice 12. Ids only.
        var payload = JsonSerializer.Serialize(
            new { originWorkspaceId = pg.WorkspaceId, aiWorkspaceId }, JsonOptions);
        var envelope = new EventEnvelope(
            Guid.NewGuid(), "escalation.opened", pg.WorkspaceId, recordId, actorUserId, _clock.UtcNow, payload, operationId);
        await _eventSpine.EmitAsync(envelope, cancellationToken).ConfigureAwait(false);

        // AiRecord is null for a PG-only escalator (the common case) — they cannot see the AI record
        // (BS §6.4); the PG UI refetches the now-escalated PG record to render the bridge.
        return new EscalateServiceResult(
            EscalateOutcome.Success, new EscalateResult(recordId, aiWorkspaceId, AiRecord: null));
    }

    /// <summary>
    /// Reads a crossing field's current PG-side value. Name/Description come from the record columns;
    /// every other crossing key comes from the content-field map. Returns false when the value is
    /// absent or empty (null, empty string, or empty array) — the required-field gate keys off this.
    /// </summary>
    private static bool TryReadCrossingValue(RequestDto pg, string fieldKey, out string rawJson, out JsonElement? element)
    {
        rawJson = string.Empty;
        element = null;

        if (fieldKey == "name")
        {
            if (string.IsNullOrWhiteSpace(pg.Name))
            {
                return false;
            }

            rawJson = JsonSerializer.Serialize(pg.Name, JsonOptions);
            return true;
        }

        if (fieldKey == "description")
        {
            if (string.IsNullOrWhiteSpace(pg.Description))
            {
                return false;
            }

            rawJson = JsonSerializer.Serialize(pg.Description, JsonOptions);
            return true;
        }

        if (!pg.Fields.TryGetValue(fieldKey, out var value) || IsEmpty(value))
        {
            return false;
        }

        rawJson = value.GetRawText();
        element = value;
        return true;
    }

    private static bool IsEmpty(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Null => true,
        JsonValueKind.Undefined => true,
        JsonValueKind.String => string.IsNullOrEmpty(value.GetString()),
        JsonValueKind.Array => value.GetArrayLength() == 0,
        _ => false,
    };
}

// Closure service (Slice 10 — api-contracts.md §3/§8, BS §8). Closes a record with an Outcome. The
// record is read on the caller's side (usp_GetRequestByIdForUser via IRequestsService) — forbidden OR
// non-existent → 403 (BS §22.6) — and the caller must be a Member+ of that workspace. The outcome is
// persisted into the record's FieldValues (usp_CloseRequest) so the existing Display / Mirror Status
// derivations pick it up, and one `request.closed` event fires (the cross-bridge closure fan-out reads
// it in later slices). Outcome notes are Confidential — never logged; the event payload carries the
// outcome value/kind + ids only (api-pii-handling.md).

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Closure;

public enum CloseOutcome
{
    Success,
    ValidationFailed,
    Denied,
}

public sealed record CloseResult(
    CloseOutcome Outcome,
    RequestDto? Request = null,
    IReadOnlyDictionary<string, string[]>? Errors = null);

public interface IClosureService
{
    Task<CloseResult> CloseAsync(
        string recordId, RequestCloseRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken);
}

public sealed class ClosureService : IClosureService
{
    private const int NotFoundError = 50043; // usp_CloseRequest — record not found → 403.

    private static readonly System.Text.Json.JsonSerializerOptions JsonOptions =
        new(System.Text.Json.JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly IRequestsService _requests;
    private readonly IAccessGuard _accessGuard;
    private readonly IEventSpine _eventSpine;
    private readonly IClock _clock;

    public ClosureService(
        AppDbContext db, IRequestsService requests, IAccessGuard accessGuard, IEventSpine eventSpine, IClock clock)
    {
        _db = db;
        _requests = requests;
        _accessGuard = accessGuard;
        _eventSpine = eventSpine;
        _clock = clock;
    }

    public async Task<CloseResult> CloseAsync(
        string recordId, RequestCloseRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var errors = Validate(request);
        if (errors.Count > 0)
        {
            return new CloseResult(CloseOutcome.ValidationFailed, Errors: errors);
        }

        var record = await _requests.GetByIdAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (record is null
            || !await _accessGuard.HasWorkspaceLevelAsync(actorUserId, record.WorkspaceId, WorkspaceLevel.Member, cancellationToken).ConfigureAwait(false))
        {
            return new CloseResult(CloseOutcome.Denied);
        }

        var outcome = request.Outcome!;

        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_CloseRequest @RecordId, @WorkspaceId, @OutcomeKind, @OutcomeValue, @Notes, @DuplicateOfRecordId, @ActorUserId",
                new[]
                {
                    new SqlParameter("@RecordId", recordId),
                    new SqlParameter("@WorkspaceId", record.WorkspaceId),
                    new SqlParameter("@OutcomeKind", outcome.Kind!),
                    new SqlParameter("@OutcomeValue", outcome.Value!),
                    new SqlParameter("@Notes", (object?)outcome.Notes ?? DBNull.Value),
                    new SqlParameter("@DuplicateOfRecordId", (object?)outcome.DuplicateOfRecordId ?? DBNull.Value),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()),
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException ex) when (ex.Number == NotFoundError)
        {
            return new CloseResult(CloseOutcome.Denied);
        }

        var payload = System.Text.Json.JsonSerializer.Serialize(
            new { outcomeKind = outcome.Kind, outcomeValue = outcome.Value, duplicateOfRecordId = outcome.DuplicateOfRecordId },
            JsonOptions);
        var envelope = new EventEnvelope(
            Guid.NewGuid(), "request.closed", record.WorkspaceId, recordId, actorUserId, _clock.UtcNow, payload, operationId);
        await _eventSpine.EmitAsync(envelope, cancellationToken).ConfigureAwait(false);

        var fresh = await _requests.GetByIdAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        return new CloseResult(CloseOutcome.Success, fresh);
    }

    /// <summary>Cross-field close validation the DTO annotations can't express — every close except
    /// Live (delivered) must record why. The "duplicates" relationship is captured as a linked record,
    /// not on the close, so no duplicate-target is required here.</summary>
    public static Dictionary<string, string[]> Validate(RequestCloseRequest request)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        var outcome = request.Outcome;

        if (outcome is null)
        {
            errors["outcome"] = new[] { "Choose an outcome to close this record." };
            return errors;
        }

        if (string.IsNullOrWhiteSpace(outcome.Value))
        {
            errors["outcome.value"] = new[] { "Choose an outcome to close this record." };
        }
        else if (!string.Equals(outcome.Value, "Live", StringComparison.Ordinal)
            && string.IsNullOrWhiteSpace(outcome.Notes))
        {
            errors["outcome.notes"] = new[] { "Add a note explaining this outcome." };
        }

        return errors;
    }
}

// Typed-links service (Slice 10 — api-contracts.md §9). Owns the Relationships card's list / add /
// remove of record-to-record references (BS §2.2). Access is gated through the FROM record on the
// caller's side (usp_GetRequestByIdForUser via IRequestsService.GetByIdAsync) — a forbidden OR
// non-existent record both resolve to null → 403, never 404 (BS §22.6); the delete proc re-gates by
// membership as defence in depth. Rationale + far-record names are Confidential — never logged; each
// event payload carries ids/kinds only (api-pii-handling.md). Every state change emits one event.

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.TypedLinks;

/// <summary>Outcome of an add-link — the controller maps it to 201 / 403 / 400.</summary>
public enum AddLinkOutcome
{
    Created,
    Forbidden,
    Invalid,
}

public sealed record AddLinkResult(
    AddLinkOutcome Outcome,
    TypedLinkDto? Link = null,
    IReadOnlyDictionary<string, string[]>? Errors = null);

public interface ITypedLinksService
{
    /// <summary>List a record's outgoing links. Null when the caller cannot see the record (→ 403).</summary>
    Task<IReadOnlyList<TypedLinkDto>?> GetLinksAsync(string recordId, Guid userId, CancellationToken cancellationToken);

    /// <summary>Add a typed link from the record to another. Access is gated on the FROM record.</summary>
    Task<AddLinkResult> AddLinkAsync(
        string recordId, AddLinkRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    /// <summary>Soft-delete a link. False when the caller cannot see the link's FROM record (→ 403).</summary>
    Task<bool> DeleteLinkAsync(Guid linkId, Guid actorUserId, string operationId, CancellationToken cancellationToken);
}

public sealed class TypedLinksService : ITypedLinksService
{
    // Guard numbers raised by usp_CreateTypedLink.
    private const int TargetNotFoundError = 50060;
    private const int DuplicateFamilyError = 50061;
    private const int SelfLinkError = 50062;

    private readonly AppDbContext _db;
    private readonly IRequestsService _requests;
    private readonly IEventSpine _eventSpine;
    private readonly IClock _clock;

    public TypedLinksService(AppDbContext db, IRequestsService requests, IEventSpine eventSpine, IClock clock)
    {
        _db = db;
        _requests = requests;
        _eventSpine = eventSpine;
        _clock = clock;
    }

    public async Task<IReadOnlyList<TypedLinkDto>?> GetLinksAsync(
        string recordId, Guid userId, CancellationToken cancellationToken)
    {
        // Gate first so a forbidden record is a 403, not an empty 200 (BS §22.6).
        var record = await _requests.GetByIdAsync(recordId, userId, cancellationToken).ConfigureAwait(false);
        if (record is null)
        {
            return null;
        }

        var rows = await _db.Set<TypedLinkRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetTypedLinksForRecord @RecordId, @UserId",
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return rows.Select(MapLink).ToList();
    }

    public async Task<AddLinkResult> AddLinkAsync(
        string recordId, AddLinkRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var record = await _requests.GetByIdAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (record is null)
        {
            return new AddLinkResult(AddLinkOutcome.Forbidden);
        }

        var toRecordId = request.ToRecordId?.Trim();
        if (string.IsNullOrEmpty(toRecordId))
        {
            return Invalid("toRecordId", "Choose a record to link to.");
        }

        if (string.Equals(toRecordId, recordId, StringComparison.Ordinal))
        {
            return Invalid("toRecordId", "A record cannot be linked to itself.");
        }

        List<TypedLinkRow> rows;
        try
        {
            rows = await _db.Set<TypedLinkRow>()
                .FromSqlRaw(
                    "EXEC dbo.usp_CreateTypedLink @FromRecordId, @ToRecordId, @LinkKind, @Rationale, @UserId, @ActorUserId",
                    new SqlParameter("@FromRecordId", recordId),
                    new SqlParameter("@ToRecordId", toRecordId),
                    new SqlParameter("@LinkKind", request.Kind!),
                    new SqlParameter("@Rationale", (object?)request.Rationale ?? DBNull.Value),
                    new SqlParameter("@UserId", actorUserId),
                    new SqlParameter("@ActorUserId", actorUserId.ToString()))
                .ToListAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException ex) when (ex.Number == TargetNotFoundError)
        {
            return Invalid("toRecordId", "That record could not be found.");
        }
        catch (SqlException ex) when (ex.Number == DuplicateFamilyError)
        {
            return Invalid("toRecordId", "A duplicate-of link must point at a record in the same workspace family.");
        }
        catch (SqlException ex) when (ex.Number == SelfLinkError)
        {
            return Invalid("toRecordId", "A record cannot be linked to itself.");
        }

        var row = rows.FirstOrDefault();
        if (row is null)
        {
            return new AddLinkResult(AddLinkOutcome.Forbidden);
        }

        await EmitAsync(
            "link.added", record.WorkspaceId, recordId, actorUserId,
            new { linkId = row.LinkId, toRecordId, kind = request.Kind }, operationId, cancellationToken).ConfigureAwait(false);

        return new AddLinkResult(AddLinkOutcome.Created, MapLink(row));
    }

    public async Task<bool> DeleteLinkAsync(
        Guid linkId, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<TypedLinkDeleteRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_DeleteTypedLink @LinkId, @UserId, @ActorUserId",
                new SqlParameter("@LinkId", linkId),
                new SqlParameter("@UserId", actorUserId),
                new SqlParameter("@ActorUserId", actorUserId.ToString()))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var result = rows.FirstOrDefault();
        if (result is null || result.Deleted == 0 || string.IsNullOrEmpty(result.FromRecordId))
        {
            return false;
        }

        // Resolve the caller's side of the FROM record to key the removal event (the delete proc
        // already confirmed the caller can see it, so this read succeeds).
        var record = await _requests.GetByIdAsync(result.FromRecordId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (record is not null)
        {
            await EmitAsync(
                "link.removed", record.WorkspaceId, result.FromRecordId, actorUserId,
                new { linkId }, operationId, cancellationToken).ConfigureAwait(false);
        }

        return true;
    }

    private static TypedLinkDto MapLink(TypedLinkRow row) => new(
        Id: row.LinkId,
        FromRecordId: row.FromRecordId,
        ToRecordId: row.ToRecordId,
        Kind: row.LinkKind,
        Rationale: row.Rationale,
        ToName: row.ToName,
        ToStage: row.ToStage,
        CreatedAt: DateTime.SpecifyKind(row.CreatedAt, DateTimeKind.Utc));

    private static AddLinkResult Invalid(string field, string message) =>
        new(AddLinkOutcome.Invalid, Errors: new Dictionary<string, string[]>(StringComparer.Ordinal) { [field] = new[] { message } });

    private async Task EmitAsync(
        string eventType, Guid workspaceId, string recordId, Guid actorUserId, object payloadObject, string operationId, CancellationToken cancellationToken)
    {
        var payload = System.Text.Json.JsonSerializer.Serialize(payloadObject, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web));
        var envelope = new EventEnvelope(
            Guid.NewGuid(), eventType, workspaceId, recordId, actorUserId, _clock.UtcNow, payload, operationId);
        await _eventSpine.EmitAsync(envelope, cancellationToken).ConfigureAwait(false);
    }
}

// Comments & activity-thread service (Slice 6 — api-contracts.md §7). Owns posting immutable
// comments and composing the interleaved activity thread (comments UNION audit events). Access is
// baked into the stored procedures; the service additionally resolves the caller's side of the
// record via usp_GetRequestByIdForUser (slice 5) so a forbidden OR non-existent record is denied
// uniformly (null → 403, never 404 — BS §22.6) and the comment lands on the correct workspace copy.
// A successful post emits exactly one event on the spine (comment.posted) carrying the resolved
// @mention targets in its payload; notification delivery consumes it in slice 12. Comment bodies and
// mention lists are Confidential — never logged; event payloads carry ids only (api-pii-handling.md).

using System.Data;
using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Comments;

public interface ICommentsService
{
    /// <summary>Post an immutable comment. Returns null when the caller cannot see the record (→ 403).</summary>
    Task<CommentDto?> PostCommentAsync(
        string recordId, CommentCreateRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    /// <summary>The interleaved thread. Returns null when the caller cannot see the record (→ 403); [] when empty.</summary>
    Task<IReadOnlyList<ActivityThreadItemDto>?> GetThreadAsync(
        string recordId, Guid userId, CancellationToken cancellationToken);
}

public sealed class CommentsService : ICommentsService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly IEventSpine _eventSpine;
    private readonly IClock _clock;

    public CommentsService(AppDbContext db, IEventSpine eventSpine, IClock clock)
    {
        _db = db;
        _eventSpine = eventSpine;
        _clock = clock;
    }

    public async Task<CommentDto?> PostCommentAsync(
        string recordId, CommentCreateRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        // Resolve the caller's side of the record (access baked into the proc join). Null → 403.
        var row = await ReadRecordAsync(recordId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (row is null)
        {
            return null;
        }

        var mentions = (request.MentionedUserIds ?? Array.Empty<Guid>())
            .Distinct()
            .ToList();
        var mentionsJson = mentions.Count == 0 ? null : JsonSerializer.Serialize(mentions, JsonOptions);
        var body = request.Body ?? string.Empty;

        var commentIdParameter = new SqlParameter("@CommentId", SqlDbType.UniqueIdentifier)
        {
            Direction = ParameterDirection.Output,
        };

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_CreateComment @RecordId, @WorkspaceId, @AuthorUserId, @Body, @MentionedUserIds, @CommentId OUTPUT",
            new[]
            {
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@WorkspaceId", row.WorkspaceId),
                new SqlParameter("@AuthorUserId", actorUserId),
                new SqlParameter("@Body", body),
                new SqlParameter("@MentionedUserIds", (object?)mentionsJson ?? DBNull.Value),
                commentIdParameter,
            },
            cancellationToken).ConfigureAwait(false);

        // A null output means the proc's own access gate denied the write (defense in depth).
        if (commentIdParameter.Value is not Guid commentId)
        {
            return null;
        }

        // One event per state change. The payload carries the mention targets (ids only) so the
        // slice-12 Notifications consumer can fan out to watchers + mentioned users. No body, no names.
        await EmitAsync(
            "comment.posted", row.WorkspaceId, recordId, actorUserId,
            new { commentId, mentionedUserIds = mentions }, operationId, cancellationToken).ConfigureAwait(false);

        return new CommentDto(commentId, recordId, "Request", actorUserId, body, mentions, _clock.UtcNow.UtcDateTime);
    }

    public async Task<IReadOnlyList<ActivityThreadItemDto>?> GetThreadAsync(
        string recordId, Guid userId, CancellationToken cancellationToken)
    {
        // Gate first so a forbidden record is a 403, not an empty 200 (BS §22.6). A legitimately
        // empty thread on an accessible record still returns [].
        var row = await ReadRecordAsync(recordId, userId, cancellationToken).ConfigureAwait(false);
        if (row is null)
        {
            return null;
        }

        var rows = await _db.Set<ActivityThreadRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetActivityThread @RecordId, @UserId",
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return rows.Select(MapThreadItem).ToList();
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

    private static ActivityThreadItemDto MapThreadItem(ActivityThreadRow row)
    {
        if (string.Equals(row.Kind, "comment", StringComparison.Ordinal))
        {
            var comment = new CommentDto(
                Id: row.CommentId ?? Guid.Empty,
                RecordId: string.Empty,
                ObjectType: "Request",
                AuthorUserId: row.AuthorUserId ?? Guid.Empty,
                Body: row.Body ?? string.Empty,
                MentionedUserIds: ParseMentionIds(row.MentionedUserIds),
                CreatedAt: DateTime.SpecifyKind(row.ItemAt, DateTimeKind.Utc));
            return new ActivityThreadItemDto("comment", comment, null);
        }

        var eventType = row.EventType ?? string.Empty;
        var evt = new AuditEventItemDto(
            EventType: eventType,
            EventAt: DateTime.SpecifyKind(row.ItemAt, DateTimeKind.Utc),
            ActorUserId: row.ActorUserId,
            Summary: SummariseEvent(eventType, row.EventPayload));
        return new ActivityThreadItemDto("event", null, evt);
    }

    /// <summary>Human-readable one-line summary for an audit event. Ids/enums only — never PII.</summary>
    public static string SummariseEvent(string eventType, string? payloadJson)
    {
        switch (eventType)
        {
            case "request.created":
                return "Request created";
            case "request.updated":
                return "Details updated";
            case "request.stage-changed":
                var toStage = ReadPayloadString(payloadJson, "toStage");
                return toStage is null ? "Stage changed" : $"Moved to {toStage}";
            case "request.hold-changed":
                var held = ReadPayloadBool(payloadJson, "held");
                return held == true ? "Placed on hold" : held == false ? "Hold cleared" : "Hold changed";
            default:
                return Prettify(eventType);
        }
    }

    private static IReadOnlyList<Guid> ParseMentionIds(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return Array.Empty<Guid>();
        }

        try
        {
            return JsonSerializer.Deserialize<List<Guid>>(json, JsonOptions) ?? new List<Guid>();
        }
        catch (JsonException)
        {
            return Array.Empty<Guid>();
        }
    }

    private static string? ReadPayloadString(string? json, string property)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
                ? value.GetString()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static bool? ReadPayloadBool(string? json, string property)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.TryGetProperty(property, out var value))
            {
                if (value.ValueKind == JsonValueKind.True) return true;
                if (value.ValueKind == JsonValueKind.False) return false;
            }

            return null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string Prettify(string eventType)
    {
        if (string.IsNullOrWhiteSpace(eventType))
        {
            return "Activity";
        }

        var text = eventType.Replace('.', ' ').Replace('-', ' ');
        return char.ToUpperInvariant(text[0]) + text[1..];
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

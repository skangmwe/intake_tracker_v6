// Announcements service (Slice 13 — api-contracts.md §12). Owns the Announcement record and its
// publish/retire lifecycle. Reads/writes go through stored procedures (joins + audience JSON +
// access gates live in SQL, api-data-access.md). Access model:
//   • Read (S21): usp_GetAnnouncementById returns the row only when the caller may see it (author,
//     workspace admin, or a member the Published, un-expired announcement's audience resolves to);
//     null → the controller answers 403, never disclosing existence (BS §22.6).
//   • Manage (create/patch/publish/retire): the controller gates WorkspaceAdmin for create; item
//     mutations are author-or-admin, resolved here from the row's own workspace/author.
// Publishing emits exactly one announcement.published event on the spine — its in-process fan-out
// (usp_FanOutNotification, slice 12/13) delivers "Announcement posted" to the audience's bells.

using System.Data;
using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Announcements;

/// <summary>Outcome of a manage mutation. The controller maps it to a status code.</summary>
public enum AnnouncementMutationOutcome
{
    Success,
    Forbidden,
    InvalidState,

    /// <summary>The chosen "posted by" author is not a member of the announcement's workspace (→ 400).</summary>
    InvalidAuthor,
}

public sealed record AnnouncementMutationResult(AnnouncementMutationOutcome Outcome, AnnouncementDto? Announcement);

public interface IAnnouncementsService
{
    Task<AnnouncementDto> CreateAsync(
        Guid workspaceId, AnnouncementCreateRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    /// <summary>S21 detail. Null when the caller cannot see it (→ 403).</summary>
    Task<AnnouncementDto?> GetByIdAsync(Guid announcementId, Guid userId, CancellationToken cancellationToken);

    /// <summary>S22 — the caller's Published, in-audience history across all their workspaces.</summary>
    Task<PaginatedResponse<AnnouncementListRow>> QueryAsync(
        Guid userId, int page, int pageSize, CancellationToken cancellationToken);

    /// <summary>S23 — every announcement in a workspace across all statuses (WorkspaceAdmin).</summary>
    Task<PaginatedResponse<AnnouncementListRow>> QueryForManageAsync(
        Guid workspaceId, int page, int pageSize, CancellationToken cancellationToken);

    Task<AnnouncementMutationResult> UpdateAsync(
        Guid announcementId, AnnouncementPatchRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    Task<AnnouncementMutationResult> PublishAsync(
        Guid announcementId, Guid actorUserId, string operationId, CancellationToken cancellationToken);

    Task<AnnouncementMutationResult> RetireAsync(
        Guid announcementId, Guid actorUserId, CancellationToken cancellationToken);

    /// <summary>Emit the announcement.published event (audit + bell fan-out) for one announcement through the
    /// shared event-spine path. The scheduler (slice 2) calls this once per row usp_TickAnnouncements newly
    /// published, so scheduled publishes fan out identically to manual publishes and are never duplicated.</summary>
    Task EmitPublishedAsync(
        Guid announcementId, Guid workspaceId, Guid actorUserId, string operationId, CancellationToken cancellationToken);
}

public sealed class AnnouncementsService : IAnnouncementsService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly IEventSpine _eventSpine;
    private readonly IAccessGuard _accessGuard;
    private readonly IClock _clock;

    public AnnouncementsService(AppDbContext db, IEventSpine eventSpine, IAccessGuard accessGuard, IClock clock)
    {
        _db = db;
        _eventSpine = eventSpine;
        _accessGuard = accessGuard;
        _clock = clock;
    }

    public async Task<AnnouncementDto> CreateAsync(
        Guid workspaceId, AnnouncementCreateRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        // "Posted by": empty → the acting admin. Membership of a chosen poster is validated in the
        // controller (it holds the workspace id); CreatedBy stays the actor for audit integrity.
        var authorUserId = request.Author == Guid.Empty ? actorUserId : request.Author;
        var storedStatus = ToStoredStatus(request.Status);

        var idParameter = new SqlParameter("@AnnouncementId", SqlDbType.UniqueIdentifier)
        {
            Direction = ParameterDirection.Output,
        };

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_CreateAnnouncement @WorkspaceId, @AuthorUserId, @Title, @Body, @Audience, @Pinned, @ExpiresOn, @Status, @ScheduledPublishAt, @AutoArchive, @CreatedBy, @AnnouncementId OUTPUT",
            new[]
            {
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@AuthorUserId", authorUserId),
                new SqlParameter("@Title", request.Title),
                new SqlParameter("@Body", request.Body),
                new SqlParameter("@Audience", JsonSerializer.Serialize(request.Audience, JsonOptions)),
                new SqlParameter("@Pinned", request.Pinned),
                new SqlParameter("@ExpiresOn", (object?)request.ExpiresOn ?? DBNull.Value),
                new SqlParameter("@Status", storedStatus),
                new SqlParameter("@ScheduledPublishAt", (object?)request.ScheduledPublishAt ?? DBNull.Value),
                new SqlParameter("@AutoArchive", request.AutoArchive),
                new SqlParameter("@CreatedBy", actorUserId.ToString()),
                idParameter,
            },
            cancellationToken).ConfigureAwait(false);

        var newId = (Guid)idParameter.Value!;

        // Created directly Published → fan out now through the same event-spine path manual publish uses.
        if (string.Equals(storedStatus, PublishedStatus, StringComparison.Ordinal))
        {
            await EmitPublishedAsync(newId, workspaceId, actorUserId, operationId, cancellationToken).ConfigureAwait(false);
        }

        // The actor can always read the row they just created (author or admin).
        var created = await GetByIdAsync(newId, actorUserId, cancellationToken).ConfigureAwait(false);
        return created!;
    }

    public async Task<AnnouncementDto?> GetByIdAsync(Guid announcementId, Guid userId, CancellationToken cancellationToken)
    {
        var row = await ReadRowAsync(announcementId, userId, cancellationToken).ConfigureAwait(false);
        return row is null ? null : Map(row);
    }

    public async Task<PaginatedResponse<AnnouncementListRow>> QueryAsync(
        Guid userId, int page, int pageSize, CancellationToken cancellationToken)
    {
        var normalizedPage = page < 1 ? 1 : page;
        var normalizedSize = pageSize < 1 ? 20 : pageSize > 100 ? 100 : pageSize;

        var rows = await _db.Set<AnnouncementListRowEntity>()
            .FromSqlRaw(
                "EXEC dbo.usp_QueryAnnouncements @UserId, @Page, @PageSize",
                new SqlParameter("@UserId", userId),
                new SqlParameter("@Page", normalizedPage),
                new SqlParameter("@PageSize", normalizedSize))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return BuildListResponse(rows, normalizedPage, normalizedSize);
    }

    public async Task<PaginatedResponse<AnnouncementListRow>> QueryForManageAsync(
        Guid workspaceId, int page, int pageSize, CancellationToken cancellationToken)
    {
        var normalizedPage = page < 1 ? 1 : page;
        var normalizedSize = pageSize < 1 ? 20 : pageSize > 100 ? 100 : pageSize;

        var rows = await _db.Set<AnnouncementListRowEntity>()
            .FromSqlRaw(
                "EXEC dbo.usp_QueryAnnouncementsForManage @WorkspaceId, @Page, @PageSize",
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@Page", normalizedPage),
                new SqlParameter("@PageSize", normalizedSize))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return BuildListResponse(rows, normalizedPage, normalizedSize);
    }

    public async Task<AnnouncementMutationResult> UpdateAsync(
        Guid announcementId, AnnouncementPatchRequest request, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var row = await ReadRowAsync(announcementId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (row is null || !await CanManageAsync(row, actorUserId, cancellationToken).ConfigureAwait(false))
        {
            return new AnnouncementMutationResult(AnnouncementMutationOutcome.Forbidden, null);
        }

        // Terminal rows (Archived, or legacy Retired) are immutable.
        if (row.Status is "Retired" or "Archived")
        {
            return new AnnouncementMutationResult(AnnouncementMutationOutcome.InvalidState, null);
        }

        // "Posted by": a chosen poster other than the actor must be a member of the row's workspace.
        var authorUserId = request.Author == Guid.Empty ? actorUserId : request.Author;
        if (authorUserId != actorUserId
            && !await _accessGuard.HasWorkspaceLevelAsync(authorUserId, row.WorkspaceId, WorkspaceLevel.Viewer, cancellationToken).ConfigureAwait(false))
        {
            return new AnnouncementMutationResult(AnnouncementMutationOutcome.InvalidAuthor, null);
        }

        var storedStatus = ToStoredStatus(request.Status);
        var wasPublished = string.Equals(row.Status, PublishedStatus, StringComparison.Ordinal);

        var foundParameter = BitOutput("@Found");
        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_UpdateAnnouncement @AnnouncementId, @Title, @Body, @Audience, @Pinned, @AuthorUserId, @Status, @ScheduledPublishAt, @AutoArchive, @ExpiresOn, @UpdatedBy, @Found OUTPUT",
            new[]
            {
                new SqlParameter("@AnnouncementId", announcementId),
                new SqlParameter("@Title", request.Title),
                new SqlParameter("@Body", request.Body),
                new SqlParameter("@Audience", JsonSerializer.Serialize(request.Audience, JsonOptions)),
                new SqlParameter("@Pinned", request.Pinned),
                new SqlParameter("@AuthorUserId", authorUserId),
                new SqlParameter("@Status", storedStatus),
                new SqlParameter("@ScheduledPublishAt", (object?)request.ScheduledPublishAt ?? DBNull.Value),
                new SqlParameter("@AutoArchive", request.AutoArchive),
                new SqlParameter("@ExpiresOn", (object?)request.ExpiresOn ?? DBNull.Value),
                new SqlParameter("@UpdatedBy", actorUserId.ToString()),
                foundParameter,
            },
            cancellationToken).ConfigureAwait(false);

        if (foundParameter.Value is not bool found || !found)
        {
            return new AnnouncementMutationResult(AnnouncementMutationOutcome.InvalidState, null);
        }

        // Edited into Published from a non-Published state → fan out exactly once (same spine path).
        if (!wasPublished && string.Equals(storedStatus, PublishedStatus, StringComparison.Ordinal))
        {
            await EmitPublishedAsync(announcementId, row.WorkspaceId, actorUserId, operationId, cancellationToken).ConfigureAwait(false);
        }

        var updated = await GetByIdAsync(announcementId, actorUserId, cancellationToken).ConfigureAwait(false);
        return new AnnouncementMutationResult(AnnouncementMutationOutcome.Success, updated);
    }

    public async Task<AnnouncementMutationResult> PublishAsync(
        Guid announcementId, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var row = await ReadRowAsync(announcementId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (row is null || !await CanManageAsync(row, actorUserId, cancellationToken).ConfigureAwait(false))
        {
            return new AnnouncementMutationResult(AnnouncementMutationOutcome.Forbidden, null);
        }

        var foundParameter = BitOutput("@Found");
        var newlyParameter = BitOutput("@NewlyPublished");
        var workspaceParameter = new SqlParameter("@WorkspaceId", SqlDbType.UniqueIdentifier)
        {
            Direction = ParameterDirection.Output,
        };

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_PublishAnnouncement @AnnouncementId, @UpdatedBy, @Found OUTPUT, @NewlyPublished OUTPUT, @WorkspaceId OUTPUT",
            new[]
            {
                new SqlParameter("@AnnouncementId", announcementId),
                new SqlParameter("@UpdatedBy", actorUserId.ToString()),
                foundParameter,
                newlyParameter,
                workspaceParameter,
            },
            cancellationToken).ConfigureAwait(false);

        if (foundParameter.Value is not bool found || !found)
        {
            // A Retired announcement cannot be published.
            return new AnnouncementMutationResult(AnnouncementMutationOutcome.InvalidState, null);
        }

        // Emit the fan-out event exactly once — only on the transition into Published.
        if (newlyParameter.Value is bool newly && newly && workspaceParameter.Value is Guid workspaceId)
        {
            await EmitPublishedAsync(announcementId, workspaceId, actorUserId, operationId, cancellationToken).ConfigureAwait(false);
        }

        var published = await GetByIdAsync(announcementId, actorUserId, cancellationToken).ConfigureAwait(false);
        return new AnnouncementMutationResult(AnnouncementMutationOutcome.Success, published);
    }

    public async Task<AnnouncementMutationResult> RetireAsync(
        Guid announcementId, Guid actorUserId, CancellationToken cancellationToken)
    {
        var row = await ReadRowAsync(announcementId, actorUserId, cancellationToken).ConfigureAwait(false);
        if (row is null || !await CanManageAsync(row, actorUserId, cancellationToken).ConfigureAwait(false))
        {
            return new AnnouncementMutationResult(AnnouncementMutationOutcome.Forbidden, null);
        }

        var foundParameter = BitOutput("@Found");
        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_RetireAnnouncement @AnnouncementId, @UpdatedBy, @Found OUTPUT",
            new[]
            {
                new SqlParameter("@AnnouncementId", announcementId),
                new SqlParameter("@UpdatedBy", actorUserId.ToString()),
                foundParameter,
            },
            cancellationToken).ConfigureAwait(false);

        var retired = await GetByIdAsync(announcementId, actorUserId, cancellationToken).ConfigureAwait(false);
        return new AnnouncementMutationResult(AnnouncementMutationOutcome.Success, retired);
    }

    private async Task<AnnouncementRow?> ReadRowAsync(Guid announcementId, Guid userId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<AnnouncementRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetAnnouncementById @AnnouncementId, @UserId",
                new SqlParameter("@AnnouncementId", announcementId),
                new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return rows.FirstOrDefault();
    }

    private async Task<bool> CanManageAsync(AnnouncementRow row, Guid actorUserId, CancellationToken cancellationToken)
    {
        if (row.AuthorUserId == actorUserId)
        {
            return true;
        }

        return await _accessGuard
            .HasWorkspaceLevelAsync(actorUserId, row.WorkspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken)
            .ConfigureAwait(false);
    }

    private static SqlParameter BitOutput(string name) =>
        new(name, SqlDbType.Bit) { Direction = ParameterDirection.Output };

    private PaginatedResponse<AnnouncementListRow> BuildListResponse(
        IReadOnlyList<AnnouncementListRowEntity> rows, int page, int pageSize)
    {
        var items = rows.Select(row =>
        {
            var scheduledPublishAt = AsUtc(row.ScheduledPublishAt);
            var autoArchiveAt = AsUtc(row.AutoArchiveAt);
            return new AnnouncementListRow(
                row.AnnouncementId,
                row.Title,
                row.BodySnippet,
                row.Pinned,
                AsUtc(row.PublishedAt),
                DeriveDisplayStatus(row.Status, scheduledPublishAt, autoArchiveAt),
                row.AuthorUserId,
                scheduledPublishAt,
                row.AutoArchive,
                autoArchiveAt,
                row.AuthorName,
                AsUtc(row.PostedAt));
        }).ToList();
        var totalCount = rows.Count > 0 ? rows[0].TotalCount : 0;
        return new PaginatedResponse<AnnouncementListRow>(items, totalCount, page, pageSize);
    }

    private AnnouncementDto Map(AnnouncementRow row)
    {
        AnnouncementAudience audience;
        try
        {
            audience = JsonSerializer.Deserialize<AnnouncementAudience>(row.Audience, JsonOptions)
                       ?? new AnnouncementAudience("everyone", null, null);
        }
        catch (JsonException)
        {
            audience = new AnnouncementAudience("everyone", null, null);
        }

        var scheduledPublishAt = AsUtc(row.ScheduledPublishAt);
        var autoArchiveAt = AsUtc(row.AutoArchiveAt);

        return new AnnouncementDto(
            row.AnnouncementId,
            row.WorkspaceId,
            row.Title,
            row.Body,
            audience,
            row.Pinned,
            row.ExpiresOn is null ? null : DateOnly.FromDateTime(row.ExpiresOn.Value),
            DeriveDisplayStatus(row.Status, scheduledPublishAt, autoArchiveAt),
            row.AuthorUserId,
            DateTime.SpecifyKind(row.CreatedAt, DateTimeKind.Utc),
            DateTime.SpecifyKind(row.UpdatedAt, DateTimeKind.Utc),
            AsUtc(row.PublishedAt),
            scheduledPublishAt,
            row.AutoArchive,
            autoArchiveAt);
    }

    private const string PublishedStatus = "Published";

    /// <summary>Wire status → stored status: 'Scheduled' stays; anything else ('Active' / empty) → Published.</summary>
    private static string ToStoredStatus(string? writeStatus) =>
        string.Equals(writeStatus, "Scheduled", StringComparison.OrdinalIgnoreCase) ? "Scheduled" : PublishedStatus;

    /// <summary>The single read-time derivation of the display status (Active / Scheduled / Archived) from
    /// the stored status + lifecycle timestamps — reused by the detail Map and the list builder so the
    /// derivation lives in exactly one place (reuses the "past-time ⇒ treated-as" precedent from §20).</summary>
    private string DeriveDisplayStatus(string storedStatus, DateTime? scheduledPublishAt, DateTime? autoArchiveAt)
    {
        var now = _clock.UtcNow;
        return storedStatus switch
        {
            "Scheduled" => scheduledPublishAt.HasValue && scheduledPublishAt.Value > now ? "Scheduled" : "Active",
            "Published" => autoArchiveAt.HasValue && autoArchiveAt.Value <= now ? "Archived" : "Active",
            "Archived" => "Archived",
            _ => "Archived", // legacy Draft / Retired collapse to Archived in the reconciled UI.
        };
    }

    /// <summary>Emit the announcement.published event (audit + bell fan-out) through the shared spine path —
    /// used by create-as-Published, edit-to-Published, manual publish, and the scheduler tick (slice 2) so
    /// fan-out is never duplicated.</summary>
    public async Task EmitPublishedAsync(
        Guid announcementId, Guid workspaceId, Guid actorUserId, string operationId, CancellationToken cancellationToken)
    {
        var payload = JsonSerializer.Serialize(new { announcementId }, JsonOptions);
        var envelope = new EventEnvelope(
            Guid.NewGuid(), "announcement.published", workspaceId, null, actorUserId, _clock.UtcNow, payload, operationId);
        await _eventSpine.EmitAsync(envelope, cancellationToken).ConfigureAwait(false);
    }

    private static DateTime? AsUtc(DateTime? value) =>
        value is null ? null : DateTime.SpecifyKind(value.Value, DateTimeKind.Utc);
}

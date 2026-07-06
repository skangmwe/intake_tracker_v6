// Home service (Slice 22 — api-contracts.md §16, BS §10.7). Composes the per-user landing from five
// viewer-scoped stored-procedure reads, all scoped to the active workspace (the caller's membership is
// verified in the controller before this runs). Four panels bind a keyless projection via FromSqlRaw;
// the "Since you were last here" read runs through raw ADO.NET because it also returns the caller's
// prior visit via an OUTPUT parameter (usp_GetHomeActivity stamps LastHomeSeenAt as a side effect, so
// the next load shows only what changed). SLA state on the work panel is derived here from the shared
// RequestsService.ComputeSla so it matches the Requests list exactly. Field values are Confidential and
// never logged; actor display names are PII (returned for the surface only).

using System.Data;
using System.Data.Common;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Home;

public interface IHomeService
{
    /// <summary>Assemble the Home payload for <paramref name="userId"/> in <paramref name="workspaceId"/>.</summary>
    Task<HomeDto> GetHomeAsync(Guid workspaceId, Guid userId, CancellationToken cancellationToken);
}

public sealed class HomeService : IHomeService
{
    // Per-panel caps (BS §10.7 — "each panel is capped"). Pinned strip shows only the freshest few.
    private const int PanelTop = 20;
    private const int PinnedTop = 5;

    private readonly AppDbContext _db;
    private readonly IClock _clock;

    public HomeService(AppDbContext db, IClock clock)
    {
        _db = db;
        _clock = clock;
    }

    public async Task<HomeDto> GetHomeAsync(Guid workspaceId, Guid userId, CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(_clock.UtcNow.UtcDateTime);

        var decisionRows = await ReadDecisionsAsync(workspaceId, userId, cancellationToken).ConfigureAwait(false);
        var workRows = await ReadWorkAsync(workspaceId, userId, cancellationToken).ConfigureAwait(false);
        var (activity, sinceLastSeenAt) = await ReadActivityAsync(workspaceId, userId, cancellationToken).ConfigureAwait(false);
        var triageRows = await ReadTriageAsync(workspaceId, userId, cancellationToken).ConfigureAwait(false);
        var pinnedRows = await ReadPinnedAnnouncementsAsync(workspaceId, userId, cancellationToken).ConfigureAwait(false);

        var decisions = decisionRows
            .Select(row => new HomeDecisionItem(
                row.RecordId, row.Name, row.GateLabel, row.RoleLabel, Utc(row.OpenedAt)))
            .ToList();

        var work = workRows
            .Select(row =>
            {
                DateOnly? due = row.DueDate is null ? null : DateOnly.FromDateTime(row.DueDate.Value);
                return new HomeWorkItem(
                    row.RecordId,
                    row.Name,
                    row.StageLabel,
                    row.Origin,
                    due?.ToString("yyyy-MM-dd"),
                    RequestsService.ComputeSla(due, today, row.DueSoonWindowDays));
            })
            .ToList();

        var triage = triageRows
            .Select(row => new HomeTriageItem(row.RecordId, row.Name, row.Origin, Utc(row.ReceivedAt)))
            .ToList();

        var pinned = pinnedRows
            .Select(row => new HomePinnedAnnouncement(
                row.AnnouncementId, row.Title, row.BodySnippet, UtcOrNull(row.PublishedAt)))
            .ToList();

        return new HomeDto(
            WorkspaceId: workspaceId,
            Decisions: decisions,
            DecisionCount: decisionRows.Count > 0 ? decisionRows[0].TotalCount : 0,
            Work: work,
            WorkCount: workRows.Count > 0 ? workRows[0].TotalCount : 0,
            Activity: activity,
            SinceLastSeenAt: sinceLastSeenAt,
            Triage: triage,
            TriageCount: triageRows.Count > 0 ? triageRows[0].TotalCount : 0,
            PinnedAnnouncements: pinned);
    }

    private async Task<IReadOnlyList<HomeDecisionRow>> ReadDecisionsAsync(
        Guid workspaceId, Guid userId, CancellationToken cancellationToken) =>
        await _db.Set<HomeDecisionRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetHomeDecisions @UserId, @WorkspaceId, @Top",
                new SqlParameter("@UserId", userId),
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@Top", PanelTop))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

    private async Task<IReadOnlyList<HomeWorkRow>> ReadWorkAsync(
        Guid workspaceId, Guid userId, CancellationToken cancellationToken) =>
        await _db.Set<HomeWorkRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetHomeWork @UserId, @WorkspaceId, @Top",
                new SqlParameter("@UserId", userId),
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@Top", PanelTop))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

    private async Task<IReadOnlyList<HomeTriageRow>> ReadTriageAsync(
        Guid workspaceId, Guid userId, CancellationToken cancellationToken) =>
        await _db.Set<HomeTriageRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetHomeTriage @UserId, @WorkspaceId, @Top",
                new SqlParameter("@UserId", userId),
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@Top", PanelTop))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

    private async Task<IReadOnlyList<HomePinnedAnnouncementRow>> ReadPinnedAnnouncementsAsync(
        Guid workspaceId, Guid userId, CancellationToken cancellationToken) =>
        await _db.Set<HomePinnedAnnouncementRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetHomePinnedAnnouncements @UserId, @WorkspaceId, @Top",
                new SqlParameter("@UserId", userId),
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@Top", PinnedTop))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

    // Raw ADO.NET: this read returns a result set AND the caller's prior visit via an OUTPUT parameter,
    // which FromSqlRaw cannot surface. Mirrors RequestsService.QueryAsync's connection handling.
    private async Task<(IReadOnlyList<HomeActivityItem> Activity, DateTime? SinceLastSeenAt)> ReadActivityAsync(
        Guid workspaceId, Guid userId, CancellationToken cancellationToken)
    {
        var activity = new List<HomeActivityItem>();

        var connection = _db.Database.GetDbConnection();
        var mustClose = connection.State != ConnectionState.Open;
        if (mustClose)
        {
            await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
        }

        var sinceParameter = new SqlParameter("@SinceLastSeenAt", SqlDbType.DateTime2)
        {
            Direction = ParameterDirection.Output,
        };

        try
        {
            using var command = connection.CreateCommand();
            command.CommandText = "EXEC dbo.usp_GetHomeActivity @UserId, @WorkspaceId, @Top, @SinceLastSeenAt OUTPUT";
            command.Parameters.Add(new SqlParameter("@UserId", userId));
            command.Parameters.Add(new SqlParameter("@WorkspaceId", workspaceId));
            command.Parameters.Add(new SqlParameter("@Top", PanelTop));
            command.Parameters.Add(sinceParameter);

            await using (var reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false))
            {
                var recordIdIndex = reader.GetOrdinal("RecordId");
                var nameIndex = reader.GetOrdinal("Name");
                var eventTypeIndex = reader.GetOrdinal("EventType");
                var actorNameIndex = reader.GetOrdinal("ActorName");
                var eventAtIndex = reader.GetOrdinal("EventAt");

                while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
                {
                    activity.Add(new HomeActivityItem(
                        RecordId: reader.IsDBNull(recordIdIndex) ? null : reader.GetString(recordIdIndex),
                        Name: reader.IsDBNull(nameIndex) ? string.Empty : reader.GetString(nameIndex),
                        EventType: reader.IsDBNull(eventTypeIndex) ? string.Empty : reader.GetString(eventTypeIndex),
                        ActorName: reader.IsDBNull(actorNameIndex) ? null : reader.GetString(actorNameIndex),
                        EventAt: Utc(reader.GetDateTime(eventAtIndex))));
                }
            }

            // OUTPUT parameters are populated only after the reader is fully consumed and closed.
            DateTime? sinceLastSeenAt = sinceParameter.Value is DateTime prior
                ? DateTime.SpecifyKind(prior, DateTimeKind.Utc)
                : null;

            return (activity, sinceLastSeenAt);
        }
        finally
        {
            if (mustClose)
            {
                await connection.CloseAsync().ConfigureAwait(false);
            }
        }
    }

    private static DateTime Utc(DateTime value) => DateTime.SpecifyKind(value, DateTimeKind.Utc);

    private static DateTime? UtcOrNull(DateTime? value) =>
        value is null ? null : DateTime.SpecifyKind(value.Value, DateTimeKind.Utc);
}

// Announcement tick gateway (slice 2). A thin, scoped wrapper over usp_TickAnnouncements — the single
// EF call the scheduler makes each sweep. The proc is set-based and idempotent: it archives due Published
// rows and publishes due Scheduled rows, RETURNING the newly-published rows (id / workspace / author) so
// the caller fans them out. Fan-out is deliberately NOT done here — it stays in AnnouncementsService's
// event-spine path (single-sourced). Isolating the proc call behind this interface lets the scheduler's
// orchestration be unit-tested with Moq, since AppDbContext / FromSqlRaw is not itself unit-mockable
// (proc behaviour is covered by the tSQLt tests from slice 1).

using McDermott.AiTracker.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Announcements;

public interface IAnnouncementTickGateway
{
    /// <summary>Run usp_TickAnnouncements once. Returns the rows it newly published (empty when nothing was due).</summary>
    Task<IReadOnlyList<AnnouncementTickRow>> RunTickAsync(CancellationToken cancellationToken);
}

public sealed class AnnouncementTickGateway : IAnnouncementTickGateway
{
    private readonly AppDbContext _db;

    public AnnouncementTickGateway(AppDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<AnnouncementTickRow>> RunTickAsync(CancellationToken cancellationToken)
    {
        // No parameters — the proc reads SYSUTCDATETIME() itself. Constant SQL, so no injection surface.
        return await _db.Set<AnnouncementTickRow>()
            .FromSqlRaw("EXEC dbo.usp_TickAnnouncements")
            .ToListAsync(cancellationToken).ConfigureAwait(false);
    }
}

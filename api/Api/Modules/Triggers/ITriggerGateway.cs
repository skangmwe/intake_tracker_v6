// Trigger data-access gateway (slice: triggers-engine-core, Task 1.4). A thin scoped wrapper over the
// trigger procs — the only DB calls the evaluator makes. Reads go through keyless-row FromSqlRaw and
// writes through ExecuteSqlRawAsync (api-data-access.md — procs, not EF LINQ CRUD). Isolating them behind
// this interface lets the evaluator's orchestration be unit-tested with Moq, since AppDbContext /
// FromSqlRaw is not itself unit-mockable (proc behaviour is covered by the tSQLt tests).

using McDermott.AiTracker.Api.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Triggers;

public interface ITriggerGateway
{
    /// <summary>Enabled 'Authored' triggers with their conditions rolled up (usp_GetEnabledAuthoredTriggers).</summary>
    Task<IReadOnlyList<EnabledTriggerRow>> GetEnabledAuthoredTriggersAsync(CancellationToken cancellationToken);

    /// <summary>Coarse candidate records (RecordId + field-value map) for one trigger (usp_GetTriggerCandidates).</summary>
    Task<IReadOnlyList<TriggerCandidateRow>> GetCandidatesAsync(Guid triggerId, CancellationToken cancellationToken);

    /// <summary>The fire watermarks for one trigger (usp_GetTriggerWatermarks) — read once per trigger per sweep.</summary>
    Task<IReadOnlyList<TriggerWatermarkRow>> GetWatermarksAsync(Guid triggerId, CancellationToken cancellationToken);

    /// <summary>Upsert the fire watermark for a (trigger, record) to the sweep date (usp_UpsertTriggerFire).</summary>
    Task UpsertFireAsync(Guid triggerId, string recordId, DateOnly firedDate, CancellationToken cancellationToken);

    /// <summary>Atomically claim today's sweep — true when this caller won the day (usp_TryBeginTriggerSweep).</summary>
    Task<bool> TryBeginSweepAsync(DateOnly today, CancellationToken cancellationToken);

    /// <summary>Record the sweep counts on today's sweep-log row (usp_FinalizeTriggerSweep).</summary>
    Task FinalizeSweepAsync(DateOnly today, int evaluated, int fired, CancellationToken cancellationToken);
}

public sealed class TriggerGateway : ITriggerGateway
{
    private const string SystemActor = "system";

    private readonly AppDbContext _db;

    public TriggerGateway(AppDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<EnabledTriggerRow>> GetEnabledAuthoredTriggersAsync(CancellationToken cancellationToken) =>
        await _db.Set<EnabledTriggerRow>()
            .FromSqlRaw("EXEC dbo.usp_GetEnabledAuthoredTriggers")
            .ToListAsync(cancellationToken).ConfigureAwait(false);

    public async Task<IReadOnlyList<TriggerCandidateRow>> GetCandidatesAsync(Guid triggerId, CancellationToken cancellationToken) =>
        await _db.Set<TriggerCandidateRow>()
            .FromSqlRaw("EXEC dbo.usp_GetTriggerCandidates @TriggerId", new SqlParameter("@TriggerId", triggerId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

    public async Task<IReadOnlyList<TriggerWatermarkRow>> GetWatermarksAsync(Guid triggerId, CancellationToken cancellationToken) =>
        await _db.Set<TriggerWatermarkRow>()
            .FromSqlRaw("EXEC dbo.usp_GetTriggerWatermarks @TriggerId", new SqlParameter("@TriggerId", triggerId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

    public async Task UpsertFireAsync(Guid triggerId, string recordId, DateOnly firedDate, CancellationToken cancellationToken) =>
        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_UpsertTriggerFire @TriggerId, @RecordId, @FiredDate, @By",
            new[]
            {
                new SqlParameter("@TriggerId", triggerId),
                new SqlParameter("@RecordId", recordId),
                new SqlParameter("@FiredDate", firedDate.ToDateTime(TimeOnly.MinValue)),
                new SqlParameter("@By", SystemActor),
            },
            cancellationToken).ConfigureAwait(false);

    public async Task<bool> TryBeginSweepAsync(DateOnly today, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<TriggerSweepClaimRow>()
            .FromSqlRaw("EXEC dbo.usp_TryBeginTriggerSweep @Today, @By",
                new SqlParameter("@Today", today.ToDateTime(TimeOnly.MinValue)),
                new SqlParameter("@By", SystemActor))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return rows.Count > 0 && rows[0].Claimed;
    }

    public async Task FinalizeSweepAsync(DateOnly today, int evaluated, int fired, CancellationToken cancellationToken) =>
        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_FinalizeTriggerSweep @Today, @Evaluated, @Fired",
            new[]
            {
                new SqlParameter("@Today", today.ToDateTime(TimeOnly.MinValue)),
                new SqlParameter("@Evaluated", evaluated),
                new SqlParameter("@Fired", fired),
            },
            cancellationToken).ConfigureAwait(false);
}

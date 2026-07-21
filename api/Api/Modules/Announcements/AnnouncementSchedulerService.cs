// Announcement scheduler (slice 2 — design spec §5). A hosted BackgroundService that sweeps
// usp_TickAnnouncements on a ~60s timer to catch up the stored lifecycle between requests: due Scheduled
// posts flip to Published, due Published posts auto-archive. For each row the tick newly publishes it emits
// exactly one announcement.published event through the SAME event-spine path manual publish uses
// (AnnouncementsService.EmitPublishedAsync), so audit + bell fan-out stay single-sourced in the API and are
// never duplicated in SQL.
//
// It runs in-process in the API host — the same pattern as ImportProcessor (slice 16) and the slice-12
// notification fan-out: the dev/test stack has no Service Bus, so the "Worker" work runs here. Each sweep
// runs in its own DI scope because AppDbContext and the announcements service are Scoped and must never be
// resolved directly into this singleton (api-coding-standards.md — DI lifetimes; use IServiceScopeFactory).
// A sweep that throws is logged and retried next period — a transient database blip never crashes the host
// (api-error-handling.md). Cancellation (host shutdown) exits the loop cleanly.

using System.Diagnostics;
using Microsoft.Extensions.Options;
using Serilog.Context;

namespace McDermott.AiTracker.Api.Modules.Announcements;

public sealed class AnnouncementSchedulerService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly AnnouncementSchedulerOptions _options;
    private readonly ILogger<AnnouncementSchedulerService> _logger;

    public AnnouncementSchedulerService(
        IServiceScopeFactory scopeFactory,
        IOptions<AnnouncementSchedulerOptions> options,
        ILogger<AnnouncementSchedulerService> logger)
    {
        _scopeFactory = scopeFactory;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Guard against a mis-set period — PeriodicTimer requires a strictly positive interval.
        var period = TimeSpan.FromSeconds(Math.Max(1, _options.PeriodSeconds));
        using var timer = new PeriodicTimer(period);

        // Wait first, then sweep — nothing runs until one period has elapsed after startup.
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (!await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
                {
                    break;
                }

                await RunTickAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break; // Host is shutting down — stop sweeping.
            }
            catch (Exception exception)
            {
                // A failed sweep must not crash the host; the next period retries (api-error-handling.md).
                _logger.LogError(exception, "Announcement scheduler sweep failed; retrying next period.");
            }
        }
    }

    /// <summary>Run one scheduler sweep: execute the tick proc, then emit an announcement.published event for
    /// each newly-published row through the shared event-spine path. Public so the sweep is unit-testable
    /// without waiting on the timer. Each sweep runs in its own DI scope.</summary>
    public async Task RunTickAsync(CancellationToken cancellationToken)
    {
        // A per-sweep correlation id (no HTTP request here) so audit + logs for this sweep join up
        // (api-logging.md — OperationId). No PII is logged; only counts and duration.
        var operationId = Guid.NewGuid().ToString();
        using (LogContext.PushProperty("OperationId", operationId))
        {
            var startedAt = Stopwatch.GetTimestamp();
            using var scope = _scopeFactory.CreateScope();
            var gateway = scope.ServiceProvider.GetRequiredService<IAnnouncementTickGateway>();
            var announcements = scope.ServiceProvider.GetRequiredService<IAnnouncementsService>();

            var published = await gateway.RunTickAsync(cancellationToken).ConfigureAwait(false);

            // The tick has already committed each row as Published; a fan-out that fails for one row must not
            // block the others (a next sweep will not re-return already-flipped rows, so it is the only chance
            // to notify). Continue per row — the same batch-failure semantics as the document-upload pipeline —
            // and never duplicate. Cancellation (host shutdown) still propagates to abort the sweep.
            var failedFanOut = 0;
            foreach (var row in published)
            {
                try
                {
                    await announcements
                        .EmitPublishedAsync(row.AnnouncementId, row.WorkspaceId, row.AuthorUserId, operationId, cancellationToken)
                        .ConfigureAwait(false);
                }
                catch (Exception exception) when (exception is not OperationCanceledException)
                {
                    failedFanOut++;
                    _logger.LogError(exception,
                        "Announcement scheduler published {AnnouncementId} but could not fan out its notification; it will not be retried.",
                        row.AnnouncementId);
                }
            }

            var durationMs = Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds;
            if (failedFanOut > 0)
            {
                _logger.LogWarning(
                    "Announcement scheduler sweep published {PublishedCount} announcement(s) ({FailedFanOut} fan-out failure(s)) in {DurationMs}ms.",
                    published.Count, failedFanOut, durationMs);
            }
            else
            {
                _logger.LogInformation(
                    "Announcement scheduler sweep published {PublishedCount} announcement(s) in {DurationMs}ms.",
                    published.Count, durationMs);
            }
        }
    }
}

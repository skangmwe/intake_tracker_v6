// The embedding refresh scheduler (AI-assist layer — Phase 4, Slice 2). A hosted BackgroundService that
// polls on a timer and runs the once-daily embedding sweep at/after the configured hour, in-process in the
// API host — the same pattern as ScheduledTriggerService / AnnouncementSchedulerService (the dev/test stack
// has no Service Bus, so scheduled work runs here). Each run uses its own DI scope (the evaluator holds a
// Scoped AppDbContext and must never be resolved into this singleton — api-coding-standards.md). A poll that
// throws is logged and retried next period; cancellation (host shutdown) exits cleanly.
//
// Once-per-day guard: an in-process watermark (the last swept UTC date). The sweep is idempotent — a record
// already embedded at its current content hash is not returned by usp_GetRecordsNeedingEmbedding — so if two
// replicas were to sweep the same day the only cost is a bounded, rare double read (no duplicate rows). In
// the dev/test single-replica host this never happens; a cross-replica atomic day-claim (as the trigger
// sweep uses) is deferred until scale-out makes the redundant provider calls worth avoiding.

using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Extensions.Options;

namespace McDermott.AiTracker.Api.Modules.Ai.Embedding;

public sealed class EmbeddingRefreshService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly EmbeddingRefreshOptions _options;
    private readonly IClock _clock;
    private readonly ILogger<EmbeddingRefreshService> _logger;

    private DateOnly? _lastSweptDate;

    public EmbeddingRefreshService(
        IServiceScopeFactory scopeFactory,
        IOptions<EmbeddingRefreshOptions> options,
        IClock clock,
        ILogger<EmbeddingRefreshService> logger)
    {
        _scopeFactory = scopeFactory;
        _options = options.Value;
        _clock = clock;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var period = TimeSpan.FromSeconds(Math.Max(1, _options.TickPollSeconds));
        using var timer = new PeriodicTimer(period);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (!await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
                {
                    break;
                }

                await MaybeRunDailySweepAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break; // host shutting down
            }
            catch (Exception exception)
            {
                // A failed poll must not crash the host; the next period retries (api-error-handling.md).
                _logger.LogError(exception, "Embedding refresh poll failed; retrying next period.");
            }
        }
    }

    /// <summary>If today's sweep is due (the configured hour has arrived) and not yet run this UTC day, run it
    /// in a fresh DI scope and record the date. Public so the poll body is testable without the timer.</summary>
    public async Task MaybeRunDailySweepAsync(CancellationToken cancellationToken)
    {
        var now = _clock.UtcNow;
        if (now.Hour < _options.DailyHour)
        {
            return; // too early in the day
        }

        var today = DateOnly.FromDateTime(now.UtcDateTime);
        if (_lastSweptDate == today)
        {
            return; // already swept today
        }

        using var scope = _scopeFactory.CreateScope();
        var evaluator = scope.ServiceProvider.GetRequiredService<IEmbeddingRefreshEvaluator>();
        await evaluator.RunSweepAsync(cancellationToken).ConfigureAwait(false);
        _lastSweptDate = today;
    }
}

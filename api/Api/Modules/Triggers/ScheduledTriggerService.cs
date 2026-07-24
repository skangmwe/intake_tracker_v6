// The trigger scheduler (slice: triggers-engine-core, Task 1.4). A hosted BackgroundService that polls
// on a timer and runs the once-daily trigger sweep at/after the configured hour. It runs in-process in
// the API host — the same pattern as AnnouncementSchedulerService: the dev/test stack has no Service Bus,
// so the scheduled work runs here.
//
// Because the service runs in EVERY API replica, the day is claimed atomically (usp_TryBeginTriggerSweep)
// so exactly one replica runs the sweep per day. Each run uses its own DI scope (AppDbContext and the
// evaluator are Scoped and must never be resolved into this singleton — api-coding-standards.md). A poll
// that throws is logged and retried next period; cancellation (host shutdown) exits cleanly.

using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Extensions.Options;

namespace McDermott.AiTracker.Api.Modules.Triggers;

public sealed class ScheduledTriggerService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ScheduledTriggerOptions _options;
    private readonly IClock _clock;
    private readonly ILogger<ScheduledTriggerService> _logger;

    public ScheduledTriggerService(
        IServiceScopeFactory scopeFactory,
        IOptions<ScheduledTriggerOptions> options,
        IClock clock,
        ILogger<ScheduledTriggerService> logger)
    {
        _scopeFactory = scopeFactory;
        _options = options.Value;
        _clock = clock;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var period = TimeSpan.FromSeconds(Math.Max(1, _options.PollSeconds));
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
                _logger.LogError(exception, "Trigger scheduler poll failed; retrying next period.");
            }
        }
    }

    /// <summary>If today's sweep is due (the configured hour has arrived) and not yet claimed, run it in a
    /// fresh DI scope and record the counts. Public so the poll body is testable without the timer.</summary>
    public async Task MaybeRunDailySweepAsync(CancellationToken cancellationToken)
    {
        var now = _clock.UtcNow;
        if (now.Hour < _options.DailyHour)
        {
            return; // too early in the day
        }

        var today = DateOnly.FromDateTime(now.UtcDateTime);
        using var scope = _scopeFactory.CreateScope();
        var gateway = scope.ServiceProvider.GetRequiredService<ITriggerGateway>();

        // Atomic once-per-day claim across replicas — only the winner runs the sweep.
        if (!await gateway.TryBeginSweepAsync(today, cancellationToken).ConfigureAwait(false))
        {
            return;
        }

        var evaluator = scope.ServiceProvider.GetRequiredService<IScheduledTriggerEvaluator>();
        var summary = await evaluator.RunDailySweepAsync(today, cancellationToken).ConfigureAwait(false);
        await gateway.FinalizeSweepAsync(today, summary.Evaluated, summary.Fired, cancellationToken).ConfigureAwait(false);
    }
}

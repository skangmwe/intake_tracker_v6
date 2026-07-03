// Placeholder hosted service so the Worker builds and starts cleanly during
// scaffold. Real processors (Notifications fan-out consumer, CSV Import
// processor) replace this in their slices.

namespace McDermott.AiTracker.Worker;

public sealed class ScaffoldNoopService : BackgroundService
{
    private readonly ILogger<ScaffoldNoopService> _logger;

    public ScaffoldNoopService(ILogger<ScaffoldNoopService> logger) => _logger = logger;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Worker scaffold no-op running. Real processors land in slices 12 and 16.");
        try
        {
            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
        catch (TaskCanceledException)
        {
            // Expected on shutdown.
        }
    }
}

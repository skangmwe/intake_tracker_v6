// Import processor (Slice 16) — the hosted BackgroundService that drains the in-process import queue
// off the request thread (api-performance.md — long-running work does not run inline in an HTTP
// handler). It is the in-process stand-in for the Worker/Service-Bus processor named in
// module-boundaries §18: the dev/test stack has no Service Bus, so processing runs here (the same
// precedent as slice 12's in-process notification fan-out). Each job runs in its own DI scope (the
// runner + DbContext are Scoped), correlated by the job's OperationId. A job that throws is stamped
// Failed so its poller sees a terminal state; a cancellation (host shutdown) leaves it Processing
// rather than marking a false failure.

using McDermott.AiTracker.Api.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Serilog.Context;

namespace McDermott.AiTracker.Api.Modules.ImportExport;

public sealed class ImportProcessor : BackgroundService
{
    private readonly IImportQueue _queue;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ImportProcessor> _logger;

    public ImportProcessor(IImportQueue queue, IServiceScopeFactory scopeFactory, ILogger<ImportProcessor> logger)
    {
        _queue = queue;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var message in _queue.DequeueAllAsync(stoppingToken).ConfigureAwait(false))
            {
                await RunOneAsync(message, stoppingToken).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Host is shutting down — stop draining. In-flight/queued jobs stay Processing.
        }
    }

    private async Task RunOneAsync(ImportJobMessage message, CancellationToken stoppingToken)
    {
        using (LogContext.PushProperty("OperationId", message.OperationId))
        using (LogContext.PushProperty("ImportId", message.ImportId))
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var runner = scope.ServiceProvider.GetRequiredService<IImportRunner>();
                await runner.RunAsync(message, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                throw; // Propagate shutdown to the drain loop — do not mark the job failed.
            }
            catch (Exception exception)
            {
                _logger.LogError(exception, "Import {ImportId} failed during processing.", message.ImportId);
                await MarkFailedAsync(message.ImportId).ConfigureAwait(false);
            }
        }
    }

    private async Task MarkFailedAsync(Guid importId)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.ExecuteSqlRawAsync(
                "EXEC dbo.usp_CompleteImport @ImportId, @Status, @TotalRows, @LandedRows, @FlaggedRows",
                new[]
                {
                    new SqlParameter("@ImportId", importId),
                    new SqlParameter("@Status", "Failed"),
                    new SqlParameter("@TotalRows", 0),
                    new SqlParameter("@LandedRows", 0),
                    new SqlParameter("@FlaggedRows", 0),
                },
                CancellationToken.None).ConfigureAwait(false);
        }
        catch (Exception exception)
        {
            // Best-effort — if we cannot even stamp Failed, log and move on (the poller keeps showing
            // Processing, which is preferable to crashing the processor for every subsequent job).
            _logger.LogError(exception, "Import {ImportId} could not be marked Failed.", importId);
        }
    }
}

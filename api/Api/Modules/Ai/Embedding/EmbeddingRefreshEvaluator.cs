// The embedding refresh evaluator (AI-assist layer — Phase 4, Slice 2). Runs one sweep over the AI-enabled
// workspaces: for each, fetch the records whose allowlisted content is unembedded or has changed, embed them
// in batches, and upsert each vector into the store. A failing batch is logged and skipped — one bad batch
// never aborts the sweep (the same batch-continue semantics as ScheduledTriggerEvaluator; the record's
// content hash still differs, so the next daily sweep retries it). No content is logged — only counts,
// DurationMs and OperationId (api-logging.md / api-pii-handling.md).
//
// Scoped: it holds the scoped IRecordEmbeddingStore / IAiConfigService (AppDbContext). The BackgroundService
// resolves it in a fresh scope per sweep. Gateway-injected so the orchestration is unit-testable with Moq.

using System.Diagnostics;
using McDermott.AiTracker.Api.Modules.Ai.Config;
using McDermott.AiTracker.Api.Modules.Ai.Providers;
using McDermott.AiTracker.Api.Modules.Ai.Retrieval;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Extensions.Options;
using Serilog.Context;

namespace McDermott.AiTracker.Api.Modules.Ai.Embedding;

/// <summary>Counts from one embedding sweep — logged (no content) and returned to the hosted service.</summary>
public sealed record EmbeddingSweepSummary(int Evaluated, int Embedded, int Failed);

public interface IEmbeddingRefreshEvaluator
{
    /// <summary>Run one embedding sweep across every AI-enabled workspace. Returns the counts.</summary>
    Task<EmbeddingSweepSummary> RunSweepAsync(CancellationToken cancellationToken);
}

public sealed class EmbeddingRefreshEvaluator : IEmbeddingRefreshEvaluator
{
    private const string RequestObjectType = "Request";

    private readonly IAiConfigService _config;
    private readonly IRecordEmbeddingStore _store;
    private readonly IEmbeddingService _embedding;
    private readonly IClock _clock;
    private readonly EmbeddingRefreshOptions _options;
    private readonly AiOptions _aiOptions;
    private readonly ILogger<EmbeddingRefreshEvaluator> _logger;

    public EmbeddingRefreshEvaluator(
        IAiConfigService config,
        IRecordEmbeddingStore store,
        IEmbeddingService embedding,
        IClock clock,
        IOptions<EmbeddingRefreshOptions> options,
        IOptions<AiOptions> aiOptions,
        ILogger<EmbeddingRefreshEvaluator> logger)
    {
        _config = config;
        _store = store;
        _embedding = embedding;
        _clock = clock;
        _options = options.Value;
        _aiOptions = aiOptions.Value;
        _logger = logger;
    }

    public async Task<EmbeddingSweepSummary> RunSweepAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        // A per-sweep correlation id (no HTTP request here) so audit + logs join up (api-logging.md).
        var operationId = Guid.NewGuid().ToString();
        using (LogContext.PushProperty("OperationId", operationId))
        {
            var startedAt = Stopwatch.GetTimestamp();
            var evaluated = 0;
            var embedded = 0;
            var failed = 0;

            var workspaceIds = await _config.GetEnabledWorkspaceIdsAsync(cancellationToken).ConfigureAwait(false);
            var batchSize = Math.Max(1, _options.BatchSize);

            foreach (var workspaceId in workspaceIds)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var candidates = await _store
                    .GetRecordsNeedingEmbeddingAsync(workspaceId, RequestObjectType, cancellationToken)
                    .ConfigureAwait(false);

                foreach (var batch in candidates.Chunk(batchSize))
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    evaluated += batch.Length;
                    var (batchEmbedded, batchFailed) =
                        await EmbedBatchAsync(workspaceId, batch, cancellationToken).ConfigureAwait(false);
                    embedded += batchEmbedded;
                    failed += batchFailed;
                }
            }

            var durationMs = Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds;
            _logger.LogInformation(
                "Embedding sweep evaluated {Evaluated} record(s), embedded {Embedded} ({Failed} failure(s)) in {DurationMs}ms.",
                evaluated, embedded, failed, durationMs);

            return new EmbeddingSweepSummary(evaluated, embedded, failed);
        }
    }

    // Embeds one batch then upserts each vector. A batch-level embed failure counts the whole batch as failed
    // and continues (the records' hashes still differ, so the next sweep retries them). A per-record upsert
    // failure counts that record as failed without losing the rest of the batch.
    private async Task<(int Embedded, int Failed)> EmbedBatchAsync(
        Guid workspaceId, EmbeddingCandidate[] batch, CancellationToken cancellationToken)
    {
        IReadOnlyList<float[]> vectors;
        try
        {
            var contents = batch.Select(candidate => candidate.Content).ToList();
            vectors = await _embedding.EmbedBatchAsync(contents, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            _logger.LogError(exception,
                "Embedding a batch of {Count} record(s) failed; skipping the batch and continuing the sweep.",
                batch.Length);
            return (0, batch.Length);
        }

        if (vectors.Count != batch.Length)
        {
            // A provider that returned a different count than requested is a contract violation we cannot map
            // record→vector safely — fail the batch closed rather than upsert misaligned vectors.
            _logger.LogError(
                "Embedding returned {Returned} vector(s) for {Requested} record(s); skipping the batch.",
                vectors.Count, batch.Length);
            return (0, batch.Length);
        }

        var embedded = 0;
        var failed = 0;
        var embeddedAt = _clock.UtcNow.UtcDateTime;

        for (var index = 0; index < batch.Length; index++)
        {
            var candidate = batch[index];
            var vector = vectors[index];
            try
            {
                await _store.UpsertAsync(
                    workspaceId, RequestObjectType, candidate.RecordId,
                    _aiOptions.EmbeddingModel, vector.Length,
                    EmbeddingBytes.ToBytes(vector), candidate.ContentHash, embeddedAt, cancellationToken)
                    .ConfigureAwait(false);
                embedded++;
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                failed++;
                _logger.LogError(exception,
                    "Upserting an embedding failed for a record; skipping and continuing the sweep.");
            }
        }

        return (embedded, failed);
    }
}

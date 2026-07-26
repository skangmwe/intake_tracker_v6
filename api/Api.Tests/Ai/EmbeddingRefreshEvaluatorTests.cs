// Unit tests for EmbeddingRefreshEvaluator (AI-assist layer — Phase 4, Slice 2). The procs are covered by
// tSQLt; these cover the C# orchestration: sweep only AI-enabled workspaces, embed unembedded candidates and
// upsert each vector, batch-level failure isolation (a bad batch is counted and skipped, the sweep continues),
// empty-candidate no-op, and cancellation (api-testing-guidelines.md — happy / permanent-failure / cancellation,
// plus every branch). AppDbContext / FromSqlRaw sits behind IRecordEmbeddingStore / IAiConfigService.

using McDermott.AiTracker.Api.Modules.Ai;
using McDermott.AiTracker.Api.Modules.Ai.Config;
using McDermott.AiTracker.Api.Modules.Ai.Embedding;
using McDermott.AiTracker.Api.Modules.Ai.Providers;
using McDermott.AiTracker.Api.Modules.Ai.Retrieval;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class EmbeddingRefreshEvaluatorTests
{
    private static readonly Guid WorkspaceId = Guid.Parse("1a150000-0000-4000-8000-000000000001");

    private sealed class FixedClock : IClock
    {
        public DateTimeOffset UtcNow { get; init; } = new(2026, 7, 25, 10, 0, 0, TimeSpan.Zero);
    }

    private static EmbeddingCandidate Candidate(string recordId, string content) =>
        new(recordId, ContentHash: recordId + "-hash", Content: content);

    private static (EmbeddingRefreshEvaluator Sut,
                    Mock<IAiConfigService> Config,
                    Mock<IRecordEmbeddingStore> Store,
                    Mock<IEmbeddingService> Embedding) Build(int batchSize = 16)
    {
        var config = new Mock<IAiConfigService>();
        var store = new Mock<IRecordEmbeddingStore>();
        var embedding = new Mock<IEmbeddingService>();

        store.Setup(current => current.UpsertAsync(
                It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<int>(), It.IsAny<byte[]>(), It.IsAny<string>(), It.IsAny<DateTime>(),
                It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var sut = new EmbeddingRefreshEvaluator(
            config.Object, store.Object, embedding.Object, new FixedClock(),
            Options.Create(new EmbeddingRefreshOptions { BatchSize = batchSize }),
            Options.Create(new AiOptions { EmbeddingModel = "text-embedding-3-large" }),
            NullLogger<EmbeddingRefreshEvaluator>.Instance);

        return (sut, config, store, embedding);
    }

    [Fact]
    public async Task RunSweep_EnabledWorkspaceWithUnembeddedRecord_EmbedsAndUpserts()
    {
        // Arrange
        var (sut, config, store, embedding) = Build();
        var candidate = Candidate("LIT-9001", "Name: Contract helper");
        var vector = new[] { 0.1f, -0.2f, 0.3f };
        config.Setup(current => current.GetEnabledWorkspaceIdsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { WorkspaceId });
        store.Setup(current => current.GetRecordsNeedingEmbeddingAsync(WorkspaceId, "Request", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { candidate });
        embedding.Setup(current => current.EmbedBatchAsync(It.IsAny<IReadOnlyList<string>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { vector });

        // Act
        var summary = await sut.RunSweepAsync(CancellationToken.None);

        // Assert
        Assert.Equal(new EmbeddingSweepSummary(Evaluated: 1, Embedded: 1, Failed: 0), summary);
        store.Verify(current => current.UpsertAsync(
            WorkspaceId, "Request", "LIT-9001", "text-embedding-3-large", vector.Length,
            EmbeddingBytes.ToBytes(vector), candidate.ContentHash, It.IsAny<DateTime>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task RunSweep_DisabledWorkspace_SkippedNoStoreOrEmbedCalls()
    {
        // Arrange - no AI-enabled workspaces.
        var (sut, config, store, embedding) = Build();
        config.Setup(current => current.GetEnabledWorkspaceIdsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<Guid>());

        // Act
        var summary = await sut.RunSweepAsync(CancellationToken.None);

        // Assert
        Assert.Equal(new EmbeddingSweepSummary(0, 0, 0), summary);
        store.Verify(current => current.GetRecordsNeedingEmbeddingAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        embedding.Verify(current => current.EmbedBatchAsync(It.IsAny<IReadOnlyList<string>>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task RunSweep_EmbedThrowsForOneBatch_ContinuesOthers_CountsFailed()
    {
        // Arrange - two candidates, batch size 1 so each is its own batch; the "bad" one throws on embed.
        var (sut, config, store, embedding) = Build(batchSize: 1);
        var good = Candidate("LIT-9001", "good-content");
        var bad = Candidate("LIT-9002", "bad-content");
        config.Setup(current => current.GetEnabledWorkspaceIdsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { WorkspaceId });
        store.Setup(current => current.GetRecordsNeedingEmbeddingAsync(WorkspaceId, "Request", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { good, bad });
        embedding.Setup(current => current.EmbedBatchAsync(
                It.Is<IReadOnlyList<string>>(list => list.Contains("bad-content")), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("provider error"));
        embedding.Setup(current => current.EmbedBatchAsync(
                It.Is<IReadOnlyList<string>>(list => list.Contains("good-content")), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { new[] { 0.5f } });

        // Act
        var summary = await sut.RunSweepAsync(CancellationToken.None);

        // Assert - the good record embedded, the bad batch failed, the sweep did not abort.
        Assert.Equal(new EmbeddingSweepSummary(Evaluated: 2, Embedded: 1, Failed: 1), summary);
        store.Verify(current => current.UpsertAsync(
            WorkspaceId, "Request", "LIT-9001", It.IsAny<string>(), It.IsAny<int>(),
            It.IsAny<byte[]>(), It.IsAny<string>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>()), Times.Once);
        store.Verify(current => current.UpsertAsync(
            WorkspaceId, "Request", "LIT-9002", It.IsAny<string>(), It.IsAny<int>(),
            It.IsAny<byte[]>(), It.IsAny<string>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task RunSweep_NoCandidates_EmbedsNothing()
    {
        // Arrange - enabled workspace but nothing needs embedding.
        var (sut, config, store, embedding) = Build();
        config.Setup(current => current.GetEnabledWorkspaceIdsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { WorkspaceId });
        store.Setup(current => current.GetRecordsNeedingEmbeddingAsync(WorkspaceId, "Request", It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<EmbeddingCandidate>());

        // Act
        var summary = await sut.RunSweepAsync(CancellationToken.None);

        // Assert
        Assert.Equal(new EmbeddingSweepSummary(0, 0, 0), summary);
        embedding.Verify(current => current.EmbedBatchAsync(It.IsAny<IReadOnlyList<string>>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task RunSweep_Cancellation_ExitsWithoutEmbedding()
    {
        // Arrange - a cancelled token; a workspace is available but the sweep must not do external work.
        var (sut, config, store, embedding) = Build();
        config.Setup(current => current.GetEnabledWorkspaceIdsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { WorkspaceId });
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() => sut.RunSweepAsync(cts.Token));
        embedding.Verify(current => current.EmbedBatchAsync(It.IsAny<IReadOnlyList<string>>(), It.IsAny<CancellationToken>()), Times.Never);
        store.Verify(current => current.UpsertAsync(
            It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<int>(), It.IsAny<byte[]>(), It.IsAny<string>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}

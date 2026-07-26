// Unit tests for RecordRetriever (AI-assist layer — Phase 4, Slice 2). The candidate proc (the permission
// boundary) is covered by tSQLt; these cover the C# ranking: the semantic-weighted hybrid blend, the top-k
// cap, the permission invariant surfaced at the service layer (zero candidates → empty result, no exception),
// and cancellation (api-testing-guidelines.md). The candidate proc sits behind IRecordEmbeddingStore.

using McDermott.AiTracker.Api.Modules.Ai.Providers;
using McDermott.AiTracker.Api.Modules.Ai.Retrieval;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public sealed class RecordRetrieverTests
{
    private static readonly Guid WorkspaceId = Guid.Parse("1a150000-0000-4000-8000-000000000001");
    private static readonly Guid UserId = Guid.Parse("00000000-0000-4000-8000-0000000000aa");

    private static RetrievalCandidate Candidate(string recordId, float[] vector, int keywordScore) =>
        new(recordId, Title: recordId + " title", Vector: EmbeddingBytes.ToBytes(vector), KeywordScore: keywordScore);

    private static (RecordRetriever Sut, Mock<IRecordEmbeddingStore> Store) Build()
    {
        var store = new Mock<IRecordEmbeddingStore>();
        return (new RecordRetriever(store.Object), store);
    }

    [Fact]
    public async Task Retrieve_RanksBySemanticThenKeyword_CapsAtTopK()
    {
        // Arrange - query points at {1,0}. A is the strongest semantic match; B is weaker semantically but
        // keyword-heavy; C is the opposite direction. Semantic-weighted blend ⇒ order A, B, C.
        var (sut, store) = Build();
        var query = new[] { 1f, 0f };
        var candidates = new[]
        {
            Candidate("A", new[] { 1f, 0f }, keywordScore: 0),   // cosine 1  → ~0.75
            Candidate("B", new[] { 0f, 1f }, keywordScore: 4),   // cosine 0  → ~0.625 (keyword lifts it)
            Candidate("C", new[] { -1f, 0f }, keywordScore: 0),  // cosine -1 → 0
        };
        store.Setup(current => current.GetRetrievalCandidatesAsync(WorkspaceId, UserId, "contract", It.IsAny<CancellationToken>()))
            .ReturnsAsync(candidates);

        // Act
        var result = await sut.RetrieveAsync(WorkspaceId, UserId, "contract", query, topK: 2, CancellationToken.None);

        // Assert - top-k = 2, ordered by the hybrid score.
        Assert.Equal(2, result.Count);
        Assert.Equal("A", result[0].RecordId);
        Assert.Equal("B", result[1].RecordId);
        Assert.True(result[0].Score > result[1].Score);
    }

    [Fact]
    public async Task Retrieve_NonMember_ReturnsEmpty()
    {
        // Arrange - the permission boundary returned zero candidates (non-member / nothing visible).
        var (sut, store) = Build();
        store.Setup(current => current.GetRetrievalCandidatesAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<RetrievalCandidate>());

        // Act
        var result = await sut.RetrieveAsync(WorkspaceId, UserId, "contract", new[] { 1f, 0f }, topK: 20, CancellationToken.None);

        // Assert - zero candidates → zero retrieved records, no exception.
        Assert.Empty(result);
    }

    [Fact]
    public async Task Retrieve_TopKZero_ReturnsEmpty()
    {
        // Arrange - candidates exist but the caller asked for none.
        var (sut, store) = Build();
        store.Setup(current => current.GetRetrievalCandidatesAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Candidate("A", new[] { 1f, 0f }, 1) });

        // Act
        var result = await sut.RetrieveAsync(WorkspaceId, UserId, "contract", new[] { 1f, 0f }, topK: 0, CancellationToken.None);

        // Assert
        Assert.Empty(result);
    }

    [Fact]
    public async Task Retrieve_Cancellation_ThrowsWithoutFetchingCandidates()
    {
        // Arrange
        var (sut, store) = Build();
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act + Assert
        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            sut.RetrieveAsync(WorkspaceId, UserId, "contract", new[] { 1f, 0f }, topK: 20, cts.Token));
        store.Verify(current => current.GetRetrievalCandidatesAsync(
            It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}

using System.Runtime.CompilerServices;
using System.Text.Json;
using McDermott.AiTracker.Api.Modules.Ai.Chat;
using McDermott.AiTracker.Api.Modules.Ai.Config;
using McDermott.AiTracker.Api.Modules.Ai.Providers;
using McDermott.AiTracker.Api.Modules.Ai.Retrieval;
using McDermott.AiTracker.Api.Modules.Requests;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public class AskServiceTests
{
    private static readonly Guid WorkspaceId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid ConversationId = Guid.NewGuid();
    private static readonly IReadOnlyList<string> Allowlist = new[] { "Name", "Description", "WorkflowDetails" };

    private readonly Mock<IAiConfigService> _config = new();
    private readonly Mock<IEmbeddingService> _embeddings = new();
    private readonly Mock<IRecordRetriever> _retriever = new();
    private readonly Mock<IRequestsService> _requests = new();
    private readonly Mock<IAiConversationStore> _store = new();
    private readonly Mock<ILlmProviderFactory> _factory = new();

    private AskService Build() => new(
        _config.Object, _embeddings.Object, _retriever.Object, _requests.Object, _store.Object, _factory.Object,
        NullLogger<AskService>.Instance);

    private void EnableWorkspace() =>
        _config.Setup(config => config.GetAsync(WorkspaceId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiConfigDto(true, Allowlist));

    private void SeedRetrieval(params RetrievedRecord[] records) =>
        _retriever
            .Setup(retriever => retriever.RetrieveAsync(
                WorkspaceId, UserId, It.IsAny<string>(), It.IsAny<float[]>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(records);

    private FakeProvider UseProvider(FakeProvider provider)
    {
        _factory.Setup(factory => factory.Get(It.IsAny<string?>())).Returns(provider);
        return provider;
    }

    private static async Task<List<AskEvent>> Collect(IAsyncEnumerable<AskEvent> source, CancellationToken ct = default)
    {
        var events = new List<AskEvent>();
        await foreach (var streamEvent in source.WithCancellation(ct))
        {
            events.Add(streamEvent);
        }

        return events;
    }

    [Fact]
    public async Task Ask_WhenWorkspaceDisabled_YieldsErrorAndNoProviderCall()
    {
        // Arrange - AI assist off for the workspace.
        _config.Setup(config => config.GetAsync(WorkspaceId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiConfigDto(false, Allowlist));
        var sut = Build();

        // Act
        var events = await Collect(sut.AskAsync(WorkspaceId, UserId, ConversationId, "q", null, CancellationToken.None));

        // Assert - a single error event, and the model was never invoked (off the critical path).
        Assert.Single(events);
        Assert.Equal("error", events[0].Type);
        _factory.Verify(factory => factory.Get(It.IsAny<string?>()), Times.Never);
        _embeddings.Verify(embed => embed.EmbedAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Ask_NoCandidates_StreamsAnswer_NoCitations_AndPersists()
    {
        // Arrange - enabled, empty history, nothing retrieved.
        EnableWorkspace();
        _store.Setup(store => store.LoadAsync(ConversationId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<AiMessage>());
        _embeddings.Setup(embed => embed.EmbedAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { 0.1f, 0.2f });
        SeedRetrieval();
        UseProvider(new FakeProvider(new[] { "I don't have records on that." }));
        var sut = Build();

        // Act
        var events = await Collect(sut.AskAsync(WorkspaceId, UserId, ConversationId, "widgets?", null, CancellationToken.None));

        // Assert - tokens but no citation events, and both turns persisted.
        Assert.Contains(events, streamEvent => streamEvent.Type == "token");
        Assert.DoesNotContain(events, streamEvent => streamEvent.Type == "citation");
        Assert.Equal("done", events[^1].Type);
        _store.Verify(store => store.AppendAsync(ConversationId, UserId, "user", "widgets?", null, It.IsAny<CancellationToken>()), Times.Once);
        _store.Verify(store => store.AppendAsync(ConversationId, UserId, "assistant", It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Ask_ProviderEmitsCiteMarker_EmitsCitationEvent()
    {
        // Arrange - one retrieved record; the model cites it.
        EnableWorkspace();
        _store.Setup(store => store.LoadAsync(ConversationId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<AiMessage>());
        _embeddings.Setup(embed => embed.EmbedAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { 0.1f });
        SeedRetrieval(new RetrievedRecord("LIT-9004", "Retention helper", 0.9));
        _requests.Setup(requests => requests.GetByIdAsync("LIT-9004", UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(BuildRecord("LIT-9004", "Retention helper", "Summarise retention rules", "{}"));
        UseProvider(new FakeProvider(new[] { "Retention is here ", "[cite:1]", "." }));
        var sut = Build();

        // Act
        var events = await Collect(sut.AskAsync(WorkspaceId, UserId, ConversationId, "retention?", null, CancellationToken.None));

        // Assert - exactly one citation event, naming the cited record.
        var citation = Assert.Single(events, streamEvent => streamEvent.Type == "citation");
        Assert.Contains("LIT-9004", citation.DataJson);
    }

    [Fact]
    public async Task Ask_OnlyAllowlistedContentSentToProvider()
    {
        // Arrange - the record carries an off-allowlist client-matter value that must never leave the system.
        EnableWorkspace();
        _store.Setup(store => store.LoadAsync(ConversationId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<AiMessage>());
        _embeddings.Setup(embed => embed.EmbedAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { 0.1f });
        SeedRetrieval(new RetrievedRecord("LIT-9004", "Retention helper", 0.9));
        _requests.Setup(requests => requests.GetByIdAsync("LIT-9004", UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(BuildRecord(
                "LIT-9004", "Retention helper", "Summarise retention rules",
                "{\"workflowDetails\":\"weekly review\",\"clientNumber\":\"MATTER-123-SECRET\"}"));
        var provider = UseProvider(new FakeProvider(new[] { "ok" }));
        var sut = Build();

        // Act
        await Collect(sut.AskAsync(WorkspaceId, UserId, ConversationId, "retention?", null, CancellationToken.None));

        // Assert - the prompt carries the allowlisted content but never the client-matter value.
        var promptText = provider.LastRequest!.System + " " +
            string.Join(" ", provider.LastRequest.Messages.Select(message => message.Content));
        Assert.Contains("Summarise retention rules", promptText);
        Assert.Contains("weekly review", promptText);
        Assert.DoesNotContain("MATTER-123-SECRET", promptText);
    }

    [Fact]
    public async Task Ask_ProviderThrowsMidStream_YieldsErrorEvent_SkipsPersist()
    {
        // Arrange - the provider fails after the first token.
        EnableWorkspace();
        _store.Setup(store => store.LoadAsync(ConversationId, UserId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<AiMessage>());
        _embeddings.Setup(embed => embed.EmbedAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { 0.1f });
        SeedRetrieval();
        UseProvider(new FakeProvider(new[] { "partial", "more" }, throwAfterIndex: 1));
        var sut = Build();

        // Act
        var events = await Collect(sut.AskAsync(WorkspaceId, UserId, ConversationId, "q", null, CancellationToken.None));

        // Assert - the streamed token survives, an error closes it, and nothing is persisted.
        Assert.Contains(events, streamEvent => streamEvent.Type == "token");
        Assert.Equal("error", events[^1].Type);
        _store.Verify(store => store.AppendAsync(
            It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Ask_ForeignConversation_YieldsError_NoModelCall()
    {
        // Arrange - the conversation is not the caller's: the ownership gate throws.
        EnableWorkspace();
        _store.Setup(store => store.LoadAsync(ConversationId, UserId, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new KeyNotFoundException());
        var sut = Build();

        // Act
        var events = await Collect(sut.AskAsync(WorkspaceId, UserId, ConversationId, "q", null, CancellationToken.None));

        // Assert
        Assert.Single(events);
        Assert.Equal("error", events[0].Type);
        _factory.Verify(factory => factory.Get(It.IsAny<string?>()), Times.Never);
    }

    [Fact]
    public async Task Ask_Cancellation_StopsCleanly()
    {
        // Arrange - a pre-cancelled token.
        using var cts = new CancellationTokenSource();
        cts.Cancel();
        var sut = Build();

        // Act + Assert - enumeration stops with a cancellation, and the model is never invoked.
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            Collect(sut.AskAsync(WorkspaceId, UserId, ConversationId, "q", null, cts.Token), cts.Token));
        _factory.Verify(factory => factory.Get(It.IsAny<string?>()), Times.Never);
    }

    private static RequestDto BuildRecord(string id, string name, string description, string fieldsJson)
    {
        using var document = JsonDocument.Parse(fieldsJson);
        var fields = document.RootElement.EnumerateObject()
            .ToDictionary(property => property.Name, property => property.Value.Clone());

        return new RequestDto(
            Id: id,
            WorkspaceId: WorkspaceId,
            Origin: "AiSolutions",
            CreatedAt: DateTime.UtcNow,
            UpdatedAt: DateTime.UtcNow,
            CreatedBy: "seed",
            UpdatedBy: "seed",
            LegacyId: null,
            LifecycleId: Guid.NewGuid(),
            LifecycleName: "Standard delivery",
            Stages: Array.Empty<RequestStageRef>(),
            Stage: null,
            StatusHold: default,
            StatusHoldNote: null,
            Hold: null,
            Outcome: null,
            DisplayStatus: "Open",
            SlaStatus: null,
            TimeInStage: null,
            Name: name,
            Description: description,
            Fields: fields,
            Bridge: null,
            ETag: "etag");
    }

    private sealed class FakeProvider : ILlmProvider
    {
        private readonly string[] _tokens;
        private readonly int _throwAfterIndex;

        public FakeProvider(string[] tokens, int throwAfterIndex = -1)
        {
            _tokens = tokens;
            _throwAfterIndex = throwAfterIndex;
        }

        public LlmRequest? LastRequest { get; private set; }

        public string Name => "claude";

        public async IAsyncEnumerable<LlmToken> StreamAsync(
            LlmRequest request, [EnumeratorCancellation] CancellationToken ct)
        {
            LastRequest = request;
            for (var index = 0; index < _tokens.Length; index++)
            {
                ct.ThrowIfCancellationRequested();
                if (_throwAfterIndex >= 0 && index == _throwAfterIndex)
                {
                    throw new InvalidOperationException("provider failure");
                }

                yield return new LlmToken(_tokens[index]);
                await Task.Yield();
            }
        }

        public Task<LlmCompletion> CompleteAsync(LlmRequest request, int maxTokens, CancellationToken ct)
        {
            LastRequest = request;
            return Task.FromResult(new LlmCompletion(string.Concat(_tokens)));
        }
    }
}

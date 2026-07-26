using McDermott.AiTracker.Api.Modules.Ai.Drafting;
using McDermott.AiTracker.Api.Modules.Ai.Providers;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public class FieldSuggestionServiceTests
{
    private static readonly Guid WorkspaceId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    private readonly Mock<ILlmProviderFactory> _factory = new();

    private FieldSuggestionService Build() => new(_factory.Object, NullLogger<FieldSuggestionService>.Instance);

    private FakeProvider UseProvider(FakeProvider provider)
    {
        _factory.Setup(factory => factory.Get(It.IsAny<string?>())).Returns(provider);
        return provider;
    }

    private static Dictionary<string, string> Context(params (string Key, string Value)[] entries) =>
        entries.ToDictionary(entry => entry.Key, entry => entry.Value);

    [Fact]
    public async Task Suggest_FreeText_ReturnsGeneratedValue()
    {
        // Arrange - the provider returns a JSON value+rationale for a free-text field.
        UseProvider(new FakeProvider("{\"value\":\"Acme onboarding\",\"rationale\":\"Derived from the description.\"}"));
        var sut = Build();

        // Act
        var result = await sut.SuggestAsync(
            WorkspaceId, UserId, "Request", "name",
            Context(("Description", "Onboard Acme's litigation team")), null, null, CancellationToken.None);

        // Assert
        Assert.Equal("Acme onboarding", result.Value);
        Assert.Equal("Derived from the description.", result.Rationale);
    }

    [Fact]
    public async Task Suggest_SelectInSet_ReturnsOption()
    {
        // Arrange - the model picks an option that is in the offered set.
        UseProvider(new FakeProvider("{\"value\":\"High\",\"rationale\":\"Time-sensitive request.\"}"));
        var sut = Build();

        // Act
        var result = await sut.SuggestAsync(
            WorkspaceId, UserId, "Request", "priority",
            Context(("Description", "Needed before the hearing next week")),
            new[] { "Low", "Medium", "High" }, null, CancellationToken.None);

        // Assert
        Assert.Equal("High", result.Value);
    }

    [Fact]
    public async Task Suggest_SelectOutOfSet_ReturnsNullValue()
    {
        // Arrange - the model returns a value that is not one of the offered options.
        UseProvider(new FakeProvider("{\"value\":\"Urgent\",\"rationale\":\"...\"}"));
        var sut = Build();

        // Act
        var result = await sut.SuggestAsync(
            WorkspaceId, UserId, "Request", "priority",
            Context(("Description", "Needed soon")),
            new[] { "Low", "Medium", "High" }, null, CancellationToken.None);

        // Assert - out-of-set values are dropped, never invented into the field.
        Assert.Null(result.Value);
    }

    [Fact]
    public async Task Suggest_EmptyContext_ReturnsNullValue_NoProviderCall()
    {
        // Arrange - every context value is blank; there is nothing to ground a suggestion on.
        var provider = UseProvider(new FakeProvider("{\"value\":\"anything\",\"rationale\":\"...\"}"));
        var sut = Build();

        // Act
        var result = await sut.SuggestAsync(
            WorkspaceId, UserId, "Request", "name",
            Context(("Description", "  ")), null, null, CancellationToken.None);

        // Assert - null value, and the provider was never invoked (off the critical path).
        Assert.Null(result.Value);
        Assert.Equal(0, provider.CompleteCalls);
        _factory.Verify(factory => factory.Get(It.IsAny<string?>()), Times.Never);
    }

    [Fact]
    public async Task Suggest_ProviderThrows_NoRetry_Propagates()
    {
        // Arrange - a permanent provider failure.
        var provider = UseProvider(new FakeProvider(null, throws: true));
        var sut = Build();

        // Act + Assert - the error propagates once, with no retry.
        await Assert.ThrowsAsync<InvalidOperationException>(() => sut.SuggestAsync(
            WorkspaceId, UserId, "Request", "name",
            Context(("Description", "Onboard Acme")), null, null, CancellationToken.None));
        Assert.Equal(1, provider.CompleteCalls);
    }

    [Fact]
    public async Task Suggest_Cancellation_StopsCleanly()
    {
        // Arrange - a pre-cancelled token.
        var provider = UseProvider(new FakeProvider("{\"value\":\"x\",\"rationale\":\"y\"}"));
        using var cts = new CancellationTokenSource();
        cts.Cancel();
        var sut = Build();

        // Act + Assert - exits with a cancellation, and the provider is never invoked.
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => sut.SuggestAsync(
            WorkspaceId, UserId, "Request", "name",
            Context(("Description", "Onboard Acme")), null, null, cts.Token));
        Assert.Equal(0, provider.CompleteCalls);
    }

    [Fact]
    public async Task Suggest_OnlyAllowlistedContextInPrompt()
    {
        // Arrange - the service only ever receives allowlisted context; assert the prompt carries it and
        // never carries a client-matter value that was not passed in.
        var provider = UseProvider(new FakeProvider("{\"value\":\"x\",\"rationale\":\"y\"}"));
        var sut = Build();

        // Act
        await sut.SuggestAsync(
            WorkspaceId, UserId, "Request", "name",
            Context(("Description", "weekly review")), null, null, CancellationToken.None);

        // Assert
        var prompt = provider.LastRequest!.System + " " +
            string.Join(" ", provider.LastRequest.Messages.Select(message => message.Content));
        Assert.Contains("weekly review", prompt);
        Assert.Contains("name", prompt);
        Assert.DoesNotContain("MATTER-123-SECRET", prompt);
    }

    private sealed class FakeProvider : ILlmProvider
    {
        private readonly string? _response;
        private readonly bool _throws;

        public FakeProvider(string? response, bool throws = false)
        {
            _response = response;
            _throws = throws;
        }

        public LlmRequest? LastRequest { get; private set; }

        public int CompleteCalls { get; private set; }

        public string Name => "claude";

        public IAsyncEnumerable<LlmToken> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException("Field suggestions use the non-streaming path.");

        public Task<LlmCompletion> CompleteAsync(LlmRequest request, int maxTokens, CancellationToken ct)
        {
            CompleteCalls++;
            LastRequest = request;
            if (_throws)
            {
                throw new InvalidOperationException("provider failure");
            }

            return Task.FromResult(new LlmCompletion(_response!));
        }
    }
}

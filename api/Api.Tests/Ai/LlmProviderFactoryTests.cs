using System.Runtime.CompilerServices;
using McDermott.AiTracker.Api.Modules.Ai;
using McDermott.AiTracker.Api.Modules.Ai.Providers;
using Microsoft.Extensions.Options;
using Xunit;

namespace McDermott.AiTracker.Api.Tests;

public class LlmProviderFactoryTests
{
    private sealed class FakeProvider(string name) : ILlmProvider
    {
        public string Name => name;

        public async IAsyncEnumerable<LlmToken> StreamAsync(
            LlmRequest request, [EnumeratorCancellation] CancellationToken ct)
        {
            await Task.CompletedTask;
            yield return new LlmToken(name);
        }
    }

    private static LlmProviderFactory BuildSut(string defaultProvider = "claude") =>
        new(
            new ILlmProvider[] { new FakeProvider("claude"), new FakeProvider("openai") },
            Options.Create(new AiOptions { DefaultProvider = defaultProvider }));

    [Fact]
    public void Get_NullProvider_ReturnsConfiguredDefault()
    {
        // Arrange
        var sut = BuildSut();

        // Act
        var provider = sut.Get(null);

        // Assert
        Assert.Equal("claude", provider.Name);
    }

    [Fact]
    public void Get_NamedProvider_ReturnsThatProvider()
    {
        // Arrange
        var sut = BuildSut();

        // Act
        var provider = sut.Get("openai");

        // Assert
        Assert.Equal("openai", provider.Name);
    }

    [Fact]
    public void Get_UnknownProvider_FallsBackToDefault()
    {
        // Arrange
        var sut = BuildSut();

        // Act
        var provider = sut.Get("nonsense");

        // Assert
        Assert.Equal("claude", provider.Name);
    }

    [Fact]
    public void Get_ProviderMatch_IsCaseInsensitive()
    {
        // Arrange
        var sut = BuildSut();

        // Act
        var provider = sut.Get("OpenAI");

        // Assert
        Assert.Equal("openai", provider.Name);
    }
}

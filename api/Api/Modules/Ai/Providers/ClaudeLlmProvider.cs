using System.Runtime.CompilerServices;
using Anthropic;
using Anthropic.Models.Messages;
using Microsoft.Extensions.Options;

namespace McDermott.AiTracker.Api.Modules.Ai.Providers;

/// <summary>
/// Claude chat provider (the default). Wraps the official <c>Anthropic</c> SDK with MaxRetries=3
/// (api-llm-auth.md). Streams text deltas as <see cref="LlmToken"/>s; never logs request or
/// response content (api-pii-handling.md, api-logging.md).
/// </summary>
public sealed class ClaudeLlmProvider : ILlmProvider
{
    private readonly Lazy<AnthropicClient> _client;
    private readonly string _model;
    private readonly int _maxTokens;

    public ClaudeLlmProvider(string apiKey, IOptions<AiOptions> options)
    {
        var value = options.Value;
        _model = value.ClaudeChatModel;
        _maxTokens = value.MaxOutputTokens;
        // Lazy so an unconfigured key never throws at startup / DI validation — the client is built
        // (with MaxRetries=3 per api-llm-auth.md; honors Retry-After on 408/409/429/5xx) on first use.
        _client = new Lazy<AnthropicClient>(() =>
            string.IsNullOrWhiteSpace(apiKey)
                ? throw new InvalidOperationException("Anthropic API key is not configured (Ai:AnthropicApiKey).")
                : new AnthropicClient { ApiKey = apiKey, MaxRetries = 3 });
    }

    public string Name => "claude";

    public async IAsyncEnumerable<LlmToken> StreamAsync(
        LlmRequest request, [EnumeratorCancellation] CancellationToken ct)
    {
        var parameters = new MessageCreateParams
        {
            Model = _model,
            MaxTokens = _maxTokens,
            System = request.System,
            Messages = request.Messages
                .Select(message => new MessageParam
                {
                    Role = string.Equals(message.Role, "assistant", StringComparison.OrdinalIgnoreCase)
                        ? Role.Assistant
                        : Role.User,
                    Content = message.Content,
                })
                .ToList(),
        };

        await foreach (var streamEvent in
            _client.Value.Messages.CreateStreaming(parameters).WithCancellation(ct).ConfigureAwait(false))
        {
            if (streamEvent.TryPickContentBlockDelta(out var delta) && delta.Delta.TryPickText(out var text))
            {
                yield return new LlmToken(text.Text);
            }
        }
    }

    public async Task<LlmCompletion> CompleteAsync(LlmRequest request, int maxTokens, CancellationToken ct)
    {
        var parameters = new MessageCreateParams
        {
            Model = _model,
            MaxTokens = maxTokens,
            System = request.System,
            Messages = request.Messages
                .Select(message => new MessageParam
                {
                    Role = string.Equals(message.Role, "assistant", StringComparison.OrdinalIgnoreCase)
                        ? Role.Assistant
                        : Role.User,
                    Content = message.Content,
                })
                .ToList(),
        };

        var message = await _client.Value.Messages.Create(parameters, ct).ConfigureAwait(false);

        // Concatenate every text block; ignore any non-text (thinking/tool) blocks.
        var text = string.Concat(message.Content
            .Select(block => block.Value)
            .OfType<TextBlock>()
            .Select(block => block.Text));

        return new LlmCompletion(text);
    }
}

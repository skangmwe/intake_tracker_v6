using System.Runtime.CompilerServices;
using Microsoft.Extensions.Options;
using OpenAI.Chat;

namespace McDermott.AiTracker.Api.Modules.Ai.Providers;

/// <summary>
/// OpenAI chat provider — the alt provider, rarely exercised (Claude is the default). Wraps the
/// official <c>OpenAI</c> SDK against the public OpenAI API (api-llm-auth.md keeps chat on public
/// OpenAI to adopt new GPT releases day-of). Never logs request or response content.
/// </summary>
public sealed class OpenAiLlmProvider : ILlmProvider
{
    private readonly Lazy<ChatClient> _client;
    private readonly int _maxTokens;

    public OpenAiLlmProvider(string apiKey, IOptions<AiOptions> options)
    {
        var value = options.Value;
        _maxTokens = value.MaxOutputTokens;
        // Lazy so an unconfigured key never throws at startup / DI validation — built on first use.
        _client = new Lazy<ChatClient>(() =>
            string.IsNullOrWhiteSpace(apiKey)
                ? throw new InvalidOperationException("OpenAI API key is not configured (Ai:OpenAiApiKey).")
                : new ChatClient(value.OpenAiChatModel, apiKey));
    }

    public string Name => "openai";

    public async IAsyncEnumerable<LlmToken> StreamAsync(
        LlmRequest request, [EnumeratorCancellation] CancellationToken ct)
    {
        var messages = new List<ChatMessage> { new SystemChatMessage(request.System) };
        foreach (var message in request.Messages)
        {
            messages.Add(string.Equals(message.Role, "assistant", StringComparison.OrdinalIgnoreCase)
                ? new AssistantChatMessage(message.Content)
                : new UserChatMessage(message.Content));
        }

        var options = new ChatCompletionOptions { MaxOutputTokenCount = _maxTokens };

        await foreach (var update in
            _client.Value.CompleteChatStreamingAsync(messages, options, ct).ConfigureAwait(false))
        {
            foreach (var part in update.ContentUpdate)
            {
                if (!string.IsNullOrEmpty(part.Text))
                {
                    yield return new LlmToken(part.Text);
                }
            }
        }
    }
}

// Provider-neutral contracts for the AI-assist chat layer. A LlmRequest is a system
// instruction plus an ordered conversation; a provider streams LlmTokens back. These
// shapes are deliberately minimal — grounded prompt construction and citation parsing
// live above the provider (api-llm-auth.md, Slice 3).

namespace McDermott.AiTracker.Api.Modules.Ai.Providers;

/// <summary>One conversation turn. <paramref name="Role"/> is "user" or "assistant".</summary>
public sealed record LlmMessage(string Role, string Content);

/// <summary>A single chat request: a system instruction and the trimmed conversation history.</summary>
public sealed record LlmRequest(string System, IReadOnlyList<LlmMessage> Messages);

/// <summary>One streamed text delta from the model.</summary>
public sealed record LlmToken(string Text);

/// <summary>The full text of a single non-streaming completion (concatenated text blocks).</summary>
public sealed record LlmCompletion(string Text);

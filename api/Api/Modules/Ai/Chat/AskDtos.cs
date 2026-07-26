namespace McDermott.AiTracker.Api.Modules.Ai.Chat;

/// <summary>Body for POST ai/conversations — create a new thread with an optional label.</summary>
public sealed record CreateConversationRequest(string? Title);

/// <summary>Response for POST ai/conversations.</summary>
public sealed record ConversationCreatedResponse(Guid ConversationId);

/// <summary>Body for POST ai/conversations/{id}/ask — the question, plus an optional provider override
/// ("claude" / "openai"; null → the configured default).</summary>
public sealed record AskRequest(string Query, string? Provider);

/// <summary>Body for POST ai/messages/{id}/feedback — the thumbs rating ("up" / "down").</summary>
public sealed record MessageFeedbackRequest(string Rating);

/// <summary>A conversation in the list view (no message bodies).</summary>
public sealed record AiConversationSummaryResponse(Guid ConversationId, string? Title, DateTime CreatedAt, DateTime UpdatedAt);

/// <summary>A persisted message returned when loading a conversation.</summary>
public sealed record AiMessageResponse(
    Guid MessageId, string Role, string Content, string? CitationsJson, string? Feedback, DateTime CreatedAt);

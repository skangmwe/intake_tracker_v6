namespace McDermott.AiTracker.Api.Modules.Ai.Chat;

/// <summary>One persisted turn of an Ask conversation. <c>Content</c> and <c>CitationsJson</c> are Confidential
/// (AI prompt/response text) — never logged. <c>Feedback</c> is 'up' / 'down' / null.</summary>
public sealed record AiMessage(
    Guid MessageId, string Role, string Content, string? CitationsJson, string? Feedback, DateTime CreatedAt);

/// <summary>List-row for a user's own conversations (no message bodies).</summary>
public sealed record AiConversationSummary(Guid ConversationId, string? Title, DateTime CreatedAt, DateTime UpdatedAt);

/// <summary>
/// SQL-backed store for Ask conversations and their messages. Every method is <b>owner-scoped on
/// <c>userId</c></b> — a caller can never read or write another user's conversation. Reads/writes that target a
/// conversation the caller does not own throw <see cref="KeyNotFoundException"/> (the store maps the procs'
/// ownership THROWs), which the controller surfaces as 404 (non-disclosure).
/// </summary>
public interface IAiConversationStore
{
    /// <summary>Create a new conversation owned by <paramref name="userId"/> in the workspace; returns its id.</summary>
    Task<Guid> CreateAsync(Guid workspaceId, Guid userId, string? title, CancellationToken cancellationToken);

    /// <summary>Append one turn to a conversation the caller owns; returns the new message id. Throws
    /// <see cref="KeyNotFoundException"/> if the conversation is not the caller's.</summary>
    Task<Guid> AppendAsync(
        Guid conversationId, Guid userId, string role, string content, string? citationsJson, CancellationToken cancellationToken);

    /// <summary>Load the ordered messages of a conversation the caller owns. Throws
    /// <see cref="KeyNotFoundException"/> if the conversation is not the caller's (never discloses another's).</summary>
    Task<IReadOnlyList<AiMessage>> LoadAsync(Guid conversationId, Guid userId, CancellationToken cancellationToken);

    /// <summary>List the caller's own conversations in a workspace, newest-activity first, paginated.</summary>
    Task<(IReadOnlyList<AiConversationSummary> Items, int TotalCount)> ListAsync(
        Guid workspaceId, Guid userId, int page, int pageSize, CancellationToken cancellationToken);

    /// <summary>Set the thumbs feedback on a message the caller owns. Throws
    /// <see cref="KeyNotFoundException"/> if the message is not in the caller's conversation.</summary>
    Task SetFeedbackAsync(Guid messageId, Guid userId, string feedback, CancellationToken cancellationToken);
}

/// <summary>Keyless projection of <c>usp_CreateAiConversation</c> (read only via FromSqlRaw).</summary>
public sealed class AiConversationIdRow
{
    public Guid ConversationId { get; set; }
}

/// <summary>Keyless projection of <c>usp_AppendAiMessage</c> (read only via FromSqlRaw).</summary>
public sealed class AiMessageIdRow
{
    public Guid MessageId { get; set; }
}

/// <summary>Keyless projection of <c>usp_GetAiConversation</c> (read only via FromSqlRaw).</summary>
public sealed class AiMessageRow
{
    public Guid MessageId { get; set; }
    public string Role { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string? CitationsJson { get; set; }
    public string? Feedback { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>Keyless projection of <c>usp_GetAiConversationsForUser</c> (read only via FromSqlRaw).</summary>
public sealed class AiConversationListRow
{
    public Guid ConversationId { get; set; }
    public string? Title { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public int TotalCount { get; set; }
}

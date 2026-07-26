namespace McDermott.AiTracker.Api.Modules.Ai.Chat;

/// <summary>One Server-Sent Event to stream to the client. <c>Type</c> is <c>token</c> / <c>citation</c> /
/// <c>error</c>; <c>DataJson</c> is the already-serialised JSON payload for that event (api-streaming.md).</summary>
public sealed record AskEvent(string Type, string DataJson);

/// <summary>
/// Orchestrates a grounded Ask turn: off-switch gate → ownership gate → embed → permission-safe retrieve → load
/// allowlisted content of the matches → build the grounded prompt → stream the model, emitting <c>token</c> then
/// <c>citation</c> events, and persist the user+assistant turn on success. Read-only over records (no write path
/// — the human-in-the-loop guardrail). Never logs prompts, responses, or record content (api-pii-handling.md).
/// </summary>
public interface IAskService
{
    /// <summary>Stream the answer for <paramref name="query"/> over the caller's visible records in the
    /// conversation. Yields a single <c>error</c> event (and stops, without calling the model) when the workspace
    /// has AI assist off or the conversation is not the caller's; a mid-stream provider failure yields one
    /// <c>error</c> event and stops (no retry, no persist).</summary>
    IAsyncEnumerable<AskEvent> AskAsync(
        Guid workspaceId, Guid userId, Guid conversationId, string query, string? provider, CancellationToken cancellationToken);
}

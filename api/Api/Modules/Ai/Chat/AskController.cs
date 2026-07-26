// The Ask surface (Phase 4, §14): create/list/read conversations and stream a grounded answer over SSE. Reading
// and writing a conversation needs workspace membership; ownership within the workspace is enforced by the store
// (every proc scopes on the caller's UserId). A conversation the caller does not own reads as 404 (non-disclosure).
// The controller only routes/authorizes/streams — the grounding, guardrails, and persistence live in AskService.

using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Ai.Chat;

[ApiController]
[Route("api/v1/workspaces/{workspaceId:guid}/ai")]
public sealed class AskController : ControllerBase
{
    private const int DefaultPageSize = 20;
    private const int MaxPageSize = 100;
    private static readonly string[] AllowedRatings = { "up", "down" };

    private readonly IAskService _ask;
    private readonly IAiConversationStore _store;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public AskController(IAskService ask, IAiConversationStore store, IAccessGuard accessGuard, ICurrentUser currentUser)
    {
        _ask = ask;
        _store = store;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>Create a new Ask conversation owned by the caller.</summary>
    [HttpPost("conversations")]
    [ProducesResponseType(typeof(ConversationCreatedResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> CreateConversation(
        [FromRoute] Guid workspaceId, [FromBody] CreateConversationRequest request, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        NoStore();
        var conversationId = await _store.CreateAsync(workspaceId, _currentUser.UserId, request.Title, cancellationToken);
        return Ok(new ConversationCreatedResponse(conversationId));
    }

    /// <summary>List the caller's own conversations, newest-activity first, paginated.</summary>
    [HttpGet("conversations")]
    [ProducesResponseType(typeof(Requests.PaginatedResponse<AiConversationSummaryResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> ListConversations(
        [FromRoute] Guid workspaceId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = DefaultPageSize,
        CancellationToken cancellationToken = default)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        if (page < 1 || pageSize < 1 || pageSize > MaxPageSize)
        {
            return PageInvalid();
        }

        NoStore();
        var (items, totalCount) = await _store.ListAsync(workspaceId, _currentUser.UserId, page, pageSize, cancellationToken);
        var mapped = items
            .Select(item => new AiConversationSummaryResponse(item.ConversationId, item.Title, item.CreatedAt, item.UpdatedAt))
            .ToList();
        return Ok(new Requests.PaginatedResponse<AiConversationSummaryResponse>(mapped, totalCount, page, pageSize));
    }

    /// <summary>Read one conversation's messages. Own-only — a conversation the caller does not own reads as 404.</summary>
    [HttpGet("conversations/{conversationId:guid}")]
    [ProducesResponseType(typeof(IReadOnlyList<AiMessageResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetConversation(
        [FromRoute] Guid workspaceId, [FromRoute] Guid conversationId, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        IReadOnlyList<AiMessage> messages;
        try
        {
            messages = await _store.LoadAsync(conversationId, _currentUser.UserId, cancellationToken);
        }
        catch (KeyNotFoundException)
        {
            return ConversationNotFound();
        }

        NoStore();
        var mapped = messages
            .Select(message => new AiMessageResponse(
                message.MessageId, message.Role, message.Content, message.CitationsJson, message.Feedback, message.CreatedAt))
            .ToList();
        return Ok(mapped);
    }

    /// <summary>Stream a grounded answer over Server-Sent Events (token / citation / error).</summary>
    [HttpPost("conversations/{conversationId:guid}/ask")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Ask(
        [FromRoute] Guid workspaceId,
        [FromRoute] Guid conversationId,
        [FromBody] AskRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        if (string.IsNullOrWhiteSpace(request.Query))
        {
            return QueryRequired();
        }

        Response.ContentType = "text/event-stream";
        Response.Headers.CacheControl = "private, no-store";

        // Client disconnect cancels the whole pipeline (api-streaming.md — stop and release cleanly).
        await foreach (var streamEvent in _ask
            .AskAsync(workspaceId, _currentUser.UserId, conversationId, request.Query, request.Provider, HttpContext.RequestAborted)
            .WithCancellation(HttpContext.RequestAborted))
        {
            await Response.WriteAsync($"event: {streamEvent.Type}\n", cancellationToken);
            await Response.WriteAsync($"data: {streamEvent.DataJson}\n\n", cancellationToken);
            await Response.Body.FlushAsync(cancellationToken);
        }

        return new EmptyResult();
    }

    /// <summary>Record the caller's thumbs rating on one of their own messages.</summary>
    [HttpPost("messages/{messageId:guid}/feedback")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SetFeedback(
        [FromRoute] Guid workspaceId,
        [FromRoute] Guid messageId,
        [FromBody] MessageFeedbackRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        if (!AllowedRatings.Contains(request.Rating))
        {
            return RatingInvalid();
        }

        try
        {
            await _store.SetFeedbackAsync(messageId, _currentUser.UserId, request.Rating, cancellationToken);
        }
        catch (KeyNotFoundException)
        {
            return MessageNotFound();
        }

        NoStore();
        return NoContent();
    }

    private void NoStore() => Response.Headers.CacheControl = "private, no-store";

    private ObjectResult AccessDenied() =>
        Problem("https://mws.ai/errors/access-denied", "Access denied.",
            "You do not have access to AI assist in this workspace.", StatusCodes.Status403Forbidden);

    private ObjectResult ConversationNotFound() =>
        Problem("https://mws.ai/errors/not-found", "Conversation not found.",
            "This conversation could not be found.", StatusCodes.Status404NotFound);

    private ObjectResult MessageNotFound() =>
        Problem("https://mws.ai/errors/not-found", "Message not found.",
            "This message could not be found.", StatusCodes.Status404NotFound);

    private ObjectResult PageInvalid() =>
        Problem("https://mws.ai/errors/validation", "The page request is not valid.",
            $"page must be 1 or more and pageSize between 1 and {MaxPageSize}.", StatusCodes.Status400BadRequest);

    private ObjectResult QueryRequired() =>
        Problem("https://mws.ai/errors/validation", "A question is required.",
            "Enter a question to ask.", StatusCodes.Status400BadRequest);

    private ObjectResult RatingInvalid() =>
        Problem("https://mws.ai/errors/validation", "The rating is not valid.",
            "Rating must be 'up' or 'down'.", StatusCodes.Status400BadRequest);

    private static ObjectResult Problem(string type, string title, string detail, int status) =>
        new(new ProblemDetails { Type = type, Title = title, Status = status, Detail = detail })
        {
            StatusCode = status,
            ContentTypes = { "application/problem+json" },
        };
}

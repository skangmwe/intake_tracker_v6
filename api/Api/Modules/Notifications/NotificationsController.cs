// Notifications endpoints (Slice 12 — api-contracts.md §13). The bell centre. The query uses POST
// with a body (not GET with a query string) to match the established POST …/query convention and the
// api/CLAUDE.md "no complex params in query strings" rule. Every endpoint is caller-scoped in the
// service; marking someone else's notification read is a 403 that never discloses its existence.

using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Notifications;

[ApiController]
[Route("api/v1/notifications")]
public sealed class NotificationsController : ControllerBase
{
    private readonly INotificationsService _notifications;
    private readonly ICurrentUser _currentUser;

    public NotificationsController(INotificationsService notifications, ICurrentUser currentUser)
    {
        _notifications = notifications;
        _currentUser = currentUser;
    }

    /// <summary>The caller's paginated bell feed (newest first).</summary>
    [HttpPost("query")]
    [ProducesResponseType(typeof(PaginatedResponse<NotificationDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Query([FromBody] NotificationQuery query, CancellationToken cancellationToken)
    {
        var result = await _notifications.QueryAsync(_currentUser.UserId, query ?? new NotificationQuery(), cancellationToken);
        return Ok(result);
    }

    /// <summary>The caller's unread count (bell badge).</summary>
    [HttpGet("unread-count")]
    [ProducesResponseType(typeof(UnreadCountDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> UnreadCount(CancellationToken cancellationToken)
    {
        var count = await _notifications.GetUnreadCountAsync(_currentUser.UserId, cancellationToken);
        return Ok(new UnreadCountDto(count));
    }

    /// <summary>Mark all the caller's notifications read.</summary>
    [HttpPost("mark-all-read")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> MarkAllRead(CancellationToken cancellationToken)
    {
        await _notifications.MarkAllReadAsync(_currentUser.UserId, cancellationToken);
        return NoContent();
    }

    /// <summary>Mark one of the caller's notifications read. Someone else's id is a 403.</summary>
    [HttpPost("{id:guid}/mark-read")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> MarkRead([FromRoute] Guid id, CancellationToken cancellationToken)
    {
        var found = await _notifications.MarkReadAsync(id, _currentUser.UserId, cancellationToken);
        return found ? NoContent() : AccessDenied();
    }

    private ObjectResult AccessDenied() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/access-denied",
            Title = "Access denied.",
            Status = StatusCodes.Status403Forbidden,
            Detail = "You do not have access to this notification.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };
}

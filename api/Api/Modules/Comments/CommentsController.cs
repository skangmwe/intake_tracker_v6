// Comments & activity-thread endpoints (Slice 6 — api-contracts.md §7). Record-scoped paths off the
// shared /api/v1 base. The controller only routes / validates / maps the service result to a status
// code (api-coding-standards.md — no business logic in controllers). Access is resolved inside the
// service (it depends on the record's own workspace): a forbidden OR non-existent record both come
// back as null and map to 403 — never 404 — so existence is never disclosed (BS §22.6). Comments are
// immutable: there is no PATCH or DELETE endpoint (BS §9.3).

using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Comments;

[ApiController]
[Route("api/v1")]
public sealed class CommentsController : ControllerBase
{
    private readonly ICommentsService _comments;
    private readonly ICurrentUser _currentUser;

    public CommentsController(ICommentsService comments, ICurrentUser currentUser)
    {
        _comments = comments;
        _currentUser = currentUser;
    }

    /// <summary>Post an immutable comment on a record (Member+ on the record's workspace).</summary>
    [HttpPost("records/{recordId}/comments")]
    [ProducesResponseType(typeof(CommentDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> PostComment(
        [FromRoute] string recordId,
        [FromBody] CommentCreateRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Body))
        {
            return ValidationFailure(new Dictionary<string, string[]>
            {
                ["body"] = new[] { "A comment can't be empty." },
            });
        }

        var comment = await _comments.PostCommentAsync(
            recordId, request, _currentUser.UserId, OperationId(), cancellationToken);
        return comment is null
            ? AccessDenied()
            : Created($"/api/v1/records/{recordId}/thread", comment);
    }

    /// <summary>The interleaved activity thread — comments + audit events, access-gated.</summary>
    [HttpGet("records/{recordId}/thread")]
    [ProducesResponseType(typeof(IReadOnlyList<ActivityThreadItemDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetThread([FromRoute] string recordId, CancellationToken cancellationToken)
    {
        var thread = await _comments.GetThreadAsync(recordId, _currentUser.UserId, cancellationToken);
        return thread is null ? AccessDenied() : Ok(thread);
    }

    private string OperationId() =>
        HttpContext.Items.TryGetValue(OperationIdMiddleware.HeaderName, out var value) && value is string operationId
            ? operationId
            : string.Empty;

    private ObjectResult ValidationFailure(IReadOnlyDictionary<string, string[]> errors) =>
        new(new ValidationProblemDetails(errors.ToDictionary(entry => entry.Key, entry => entry.Value))
        {
            Type = "https://mws.ai/errors/validation",
            Title = "The request is not valid.",
            Status = StatusCodes.Status400BadRequest,
            Detail = "One or more fields need attention.",
        })
        {
            StatusCode = StatusCodes.Status400BadRequest,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult AccessDenied() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/access-denied",
            Title = "Access denied.",
            Status = StatusCodes.Status403Forbidden,
            Detail = "You do not have access to this record.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };
}

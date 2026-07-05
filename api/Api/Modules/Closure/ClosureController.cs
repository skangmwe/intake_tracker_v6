// Closure endpoint (Slice 10 — api-contracts.md §3/§8). Record-scoped, so access is resolved inside
// the service (a forbidden OR non-existent record both come back as 403, never 404 — BS §22.6). The
// controller only routes / validates / authorizes and maps the service result to a status code
// (api-coding-standards.md — no business logic in controllers).

using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Closure;

[ApiController]
[Route("api/v1")]
public sealed class ClosureController : ControllerBase
{
    private readonly IClosureService _closure;
    private readonly ICurrentUser _currentUser;

    public ClosureController(IClosureService closure, ICurrentUser currentUser)
    {
        _closure = closure;
        _currentUser = currentUser;
    }

    /// <summary>Close a record with an Outcome (Member+ on the record's workspace, via the service).</summary>
    [HttpPost("requests/{recordId}/close")]
    [ProducesResponseType(typeof(RequestDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Close(
        [FromRoute] string recordId,
        [FromBody] RequestCloseRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _closure.CloseAsync(recordId, request, _currentUser.UserId, OperationId(), cancellationToken);
        return result.Outcome switch
        {
            CloseOutcome.Success => Ok(result.Request),
            CloseOutcome.ValidationFailed => ValidationFailure(result.Errors!),
            _ => AccessDenied(),
        };
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
            Detail = "You do not have access to this request.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };
}

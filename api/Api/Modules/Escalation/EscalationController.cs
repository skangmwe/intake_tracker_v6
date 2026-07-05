// Escalation endpoint (Slice 9 — api-contracts.md §4). Routes/authorizes/maps only; the one-time,
// one-way bridge logic lives in EscalationService. Access is resolved inside the service (it depends
// on the record's own workspace), so a forbidden or non-existent record both return 403 — never 404,
// so existence is never disclosed (BS §22.6).

using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Escalation;

[ApiController]
[Route("api/v1")]
public sealed class EscalationController : ControllerBase
{
    private readonly IEscalationService _escalation;
    private readonly ICurrentUser _currentUser;

    public EscalationController(IEscalationService escalation, ICurrentUser currentUser)
    {
        _escalation = escalation;
        _currentUser = currentUser;
    }

    /// <summary>Escalate a PG-side Request to the AI Solutions workspace (Member+ on the PG workspace).</summary>
    [HttpPost("requests/{recordId}/escalate")]
    [ProducesResponseType(typeof(EscalateResult), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Escalate(
        [FromRoute] string recordId,
        [FromBody] EscalateRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _escalation.EscalateAsync(
            recordId, request.ConfirmPendingEdits, _currentUser.UserId, OperationId(), cancellationToken);

        return result.Outcome switch
        {
            EscalateOutcome.Success => Created($"/api/v1/requests/{result.Result!.RecordId}", result.Result),
            EscalateOutcome.PendingEdits => PendingCrossingEdits(),
            EscalateOutcome.MissingRequired => ValidationFailure(result.Errors!),
            EscalateOutcome.AlreadyEscalated => AlreadyEscalated(),
            EscalateOutcome.InvalidTarget => BadRequestProblem("An AI Solutions record cannot be escalated."),
            _ => AccessDenied(),
        };
    }

    private string OperationId() =>
        HttpContext.Items.TryGetValue(OperationIdMiddleware.HeaderName, out var value) && value is string operationId
            ? operationId
            : string.Empty;

    private ObjectResult PendingCrossingEdits() =>
        Problem(
            "https://mws.ai/errors/pending-crossing-edits",
            "Commit pending edits first.",
            StatusCodes.Status400BadRequest,
            "Commit any pending edits to the crossing fields before escalating — nothing is discarded.");

    private ObjectResult AlreadyEscalated() =>
        Problem(
            "https://mws.ai/errors/already-escalated",
            "Already escalated.",
            StatusCodes.Status409Conflict,
            "This record has already been escalated. Escalation is one-time and one-way.");

    private ObjectResult BadRequestProblem(string detail) =>
        Problem("https://mws.ai/errors/validation", "The request is not valid.", StatusCodes.Status400BadRequest, detail);

    private ObjectResult AccessDenied() =>
        Problem(
            "https://mws.ai/errors/access-denied",
            "Access denied.",
            StatusCodes.Status403Forbidden,
            "You do not have access to this request.");

    private ObjectResult ValidationFailure(IReadOnlyDictionary<string, string[]> errors) =>
        new(new ValidationProblemDetails(errors.ToDictionary(entry => entry.Key, entry => entry.Value))
        {
            Type = "https://mws.ai/errors/validation",
            Title = "The request is not valid.",
            Status = StatusCodes.Status400BadRequest,
            Detail = "A required crossing field is missing.",
        })
        {
            StatusCode = StatusCodes.Status400BadRequest,
            ContentTypes = { "application/problem+json" },
        };

    private static ObjectResult Problem(string type, string title, int status, string detail) =>
        new(new ProblemDetails
        {
            Type = type,
            Title = title,
            Status = status,
            Detail = detail,
        })
        {
            StatusCode = status,
            ContentTypes = { "application/problem+json" },
        };
}

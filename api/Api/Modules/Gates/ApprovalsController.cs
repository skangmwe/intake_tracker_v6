// Gates / Approvals endpoints (Slice 8 — api-contracts.md §6). The controller only routes / validates
// and maps the service outcome to a status code (api-coding-standards.md — no business logic). Access
// is enforced inside the service / stored procs (membership + level joins): a forbidden OR non-existent
// record both return 403 — never 404 — so existence is never disclosed (BS §22.6). ProxyContext on the
// proxy endpoint is recorded in the audit event, not echoed back.

using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Gates;

[ApiController]
[Route("api/v1")]
public sealed class ApprovalsController : ControllerBase
{
    private readonly IApprovalsService _approvals;
    private readonly Shared.Auth.ICurrentUser _currentUser;

    public ApprovalsController(IApprovalsService approvals, Shared.Auth.ICurrentUser currentUser)
    {
        _approvals = approvals;
        _currentUser = currentUser;
    }

    /// <summary>The gates on a record. Access is baked into the read — no access means 403 (never 404).</summary>
    [HttpGet("requests/{recordId}/approval-requests")]
    [ProducesResponseType(typeof(IReadOnlyList<ApprovalRequestDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetApprovalRequests(
        [FromRoute] string recordId, CancellationToken cancellationToken)
    {
        var gates = await _approvals.GetForRecordAsync(recordId, _currentUser.UserId, cancellationToken);
        return gates is null ? AccessDenied() : Ok(gates);
    }

    /// <summary>Submit an approve/reject decision on a slot (Member+).</summary>
    [HttpPost("approval-requests/{approvalRequestId:guid}/decisions")]
    [ProducesResponseType(typeof(ApprovalRequestDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SubmitDecision(
        [FromRoute] Guid approvalRequestId,
        [FromBody] ApprovalDecisionRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _approvals.SubmitDecisionAsync(
            approvalRequestId, request, _currentUser.UserId, isProxy: false, OperationId(), cancellationToken);
        return MapDecision(result);
    }

    /// <summary>Return a rejected slot to Pending so it can be signed again (Member+).</summary>
    [HttpPost("approval-requests/{approvalRequestId:guid}/re-request")]
    [ProducesResponseType(typeof(ApprovalRequestDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> ReRequest(
        [FromRoute] Guid approvalRequestId,
        [FromBody] ReRequestApprovalRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _approvals.ReRequestAsync(
            approvalRequestId, request.SlotIndex, _currentUser.UserId, OperationId(), cancellationToken);
        return MapDecision(result);
    }

    /// <summary>Record an off-platform sign-off (Workspace admin only — enforced in the proc, BS §7.3).</summary>
    [HttpPost("approval-requests/{approvalRequestId:guid}/proxy-decision")]
    [ProducesResponseType(typeof(ApprovalRequestDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> ProxyDecision(
        [FromRoute] Guid approvalRequestId,
        [FromBody] ProxyApprovalDecisionRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _approvals.SubmitDecisionAsync(
            approvalRequestId, request, _currentUser.UserId, isProxy: true, OperationId(), cancellationToken);
        return MapDecision(result);
    }

    private IActionResult MapDecision(ApprovalDecisionResult result) => result.Outcome switch
    {
        ApprovalDecisionOutcome.Success => Ok(result.Request),
        ApprovalDecisionOutcome.RejectionNeedsComment => CodedBadRequest(
            "rejection-requires-comment", "A rejection needs a comment explaining what to change."),
        ApprovalDecisionOutcome.Ineligible => CodedBadRequest(
            "not-eligible", "That name is not eligible to sign this approval slot."),
        ApprovalDecisionOutcome.UnknownSlot => CodedBadRequest(
            "unknown-slot", "That approval slot is not part of this gate."),
        ApprovalDecisionOutcome.Invalid => CodedBadRequest(
            "invalid-decision", "A decision must be either an approval or a rejection."),
        ApprovalDecisionOutcome.AlreadyResolved => Conflict(
            "gate-already-resolved", "This gate has already been resolved."),
        _ => AccessDenied(),
    };

    private string OperationId() =>
        HttpContext.Items.TryGetValue(OperationIdMiddleware.HeaderName, out var value) && value is string operationId
            ? operationId
            : string.Empty;

    private ObjectResult CodedBadRequest(string code, string detail) =>
        new(new ProblemDetails
        {
            Type = $"https://mws.ai/errors/{code}",
            Title = "The request is not valid.",
            Status = StatusCodes.Status400BadRequest,
            Detail = detail,
        })
        {
            StatusCode = StatusCodes.Status400BadRequest,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult Conflict(string code, string detail) =>
        new(new ProblemDetails
        {
            Type = $"https://mws.ai/errors/{code}",
            Title = "Conflict.",
            Status = StatusCodes.Status409Conflict,
            Detail = detail,
        })
        {
            StatusCode = StatusCodes.Status409Conflict,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult AccessDenied() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/access-denied",
            Title = "Access denied.",
            Status = StatusCodes.Status403Forbidden,
            Detail = "You do not have access to this approval.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };
}

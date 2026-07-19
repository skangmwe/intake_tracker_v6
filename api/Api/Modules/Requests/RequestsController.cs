// Requests core endpoints (Slice 5 — api-contracts.md §3). Record- and workspace-scoped paths mix,
// so actions attribute their own sub-paths off a shared /api/v1 base (matching Lifecycle/Fields).
// The controller only routes/validates/authorizes and maps the service result to a status code
// (api-coding-standards.md — no business logic in controllers). Workspace-scoped actions authorize
// against the route workspace here; record-scoped actions authorize inside the service (access
// depends on the record's own workspace, resolved from the record). Ownership/level violations and
// non-existent records both return 403 — never 404 — so existence is never disclosed (BS §22.6).

using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Requests;

[ApiController]
[Route("api/v1")]
public sealed class RequestsController : ControllerBase
{
    /// <summary>The intake nudge surfaces at most three matches (prototype S3 similar-requests panel).</summary>
    private const int SimilarTopDefault = 3;

    private readonly IRequestsService _requests;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public RequestsController(IRequestsService requests, IAccessGuard accessGuard, ICurrentUser currentUser)
    {
        _requests = requests;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>Create a Request in a workspace (Member+).</summary>
    [HttpPost("workspaces/{workspaceId:guid}/requests")]
    [ProducesResponseType(typeof(RequestDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> CreateRequest(
        [FromRoute] Guid workspaceId,
        [FromBody] RequestCreateRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Member, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _requests.CreateAsync(workspaceId, request, _currentUser.UserId, OperationId(), cancellationToken);
        return result.Outcome switch
        {
            RequestWriteOutcome.Success => Created($"/api/v1/requests/{result.Request!.Id}", result.Request),
            RequestWriteOutcome.ValidationFailed => ValidationFailure(result.Errors!),
            _ => AccessDenied(),
        };
    }

    /// <summary>The Requests list — filter/sort/page payload (Viewer+).</summary>
    [HttpPost("workspaces/{workspaceId:guid}/requests/query")]
    [ProducesResponseType(typeof(PaginatedResponse<RequestListRow>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> QueryRequests(
        [FromRoute] Guid workspaceId,
        [FromBody] PaginatedQuery query,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        var page = await _requests.QueryAsync(workspaceId, query, cancellationToken);
        return Ok(page);
    }

    /// <summary>Intake similar-requests nudge — up to 3 access-respecting matches (Viewer+, BS §9.8).</summary>
    [HttpGet("workspaces/{workspaceId:guid}/requests/similar")]
    [ProducesResponseType(typeof(IReadOnlyList<SimilarRequestDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> FindSimilar(
        [FromRoute] Guid workspaceId,
        [FromQuery(Name = "query")] string? query,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        var matches = await _requests.FindSimilarAsync(
            workspaceId, _currentUser.UserId, query, SimilarTopDefault, cancellationToken);
        return Ok(matches);
    }

    /// <summary>The full record. Access is baked into the read — no row means 403 (never 404).</summary>
    [HttpGet("requests/{recordId}")]
    [ProducesResponseType(typeof(RequestDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetRequest([FromRoute] string recordId, CancellationToken cancellationToken)
    {
        var request = await _requests.GetByIdAsync(recordId, _currentUser.UserId, cancellationToken);
        return request is null ? AccessDenied() : Ok(request);
    }

    /// <summary>Partial edit of content fields (Member+ on the record's workspace).</summary>
    [HttpPatch("requests/{recordId}")]
    [ProducesResponseType(typeof(RequestDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> UpdateRequest(
        [FromRoute] string recordId,
        [FromBody] RequestPatchRequest request,
        CancellationToken cancellationToken)
    {
        var ifMatch = ResolveIfMatch(request);
        if (string.IsNullOrWhiteSpace(ifMatch))
        {
            return ValidationFailure(new Dictionary<string, string[]>
            {
                ["ifMatch"] = new[] { "An If-Match ETag is required to edit a request." },
            });
        }

        var result = await _requests.PatchAsync(recordId, request, ifMatch, _currentUser.UserId, OperationId(), cancellationToken);
        return result.Outcome switch
        {
            RequestWriteOutcome.Success => Ok(result.Request),
            RequestWriteOutcome.Stale => StaleConflict(),
            RequestWriteOutcome.Locked => LockedField(),
            _ => AccessDenied(),
        };
    }

    /// <summary>
    /// Advance/move to a target stage (Member+). A gated transition opens an ApprovalRequest instead of
    /// advancing (200 with <c>advanced:false, gateOpened</c>); the record advances once the gate resolves.
    /// </summary>
    [HttpPost("requests/{recordId}/stage")]
    [ProducesResponseType(typeof(StageTransitionResultDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> MoveStage(
        [FromRoute] string recordId,
        [FromBody] StageTransitionRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _requests.SetStageAsync(recordId, request.ToStage!, _currentUser.UserId, OperationId(), cancellationToken);
        return result.Outcome switch
        {
            StageMoveOutcome.Success => Ok(result.Result),
            StageMoveOutcome.GateOpened => Ok(result.Result),
            StageMoveOutcome.InvalidStage => BadRequestProblem("That stage is not part of this record's lifecycle."),
            StageMoveOutcome.GateAlreadyOpen => GateAlreadyOpenConflict(),
            StageMoveOutcome.RecordOnHold => RecordOnHoldConflict(),
            _ => AccessDenied(),
        };
    }

    /// <summary>Set or clear the Hold flag (Member+).</summary>
    [HttpPost("requests/{recordId}/hold")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> SetHold(
        [FromRoute] string recordId,
        [FromBody] HoldInput request,
        CancellationToken cancellationToken)
    {
        var outcome = await _requests.SetHoldAsync(
            recordId, request.Held, request.Reason, _currentUser.UserId, OperationId(), cancellationToken);
        return outcome == RequestWriteOutcome.Success ? NoContent() : AccessDenied();
    }

    private string? ResolveIfMatch(RequestPatchRequest request)
    {
        var header = Request.Headers.IfMatch.ToString();
        if (!string.IsNullOrWhiteSpace(header))
        {
            return header.Trim().Trim('"');
        }

        return request.IfMatch;
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

    private ObjectResult BadRequestProblem(string detail) =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/validation",
            Title = "The request is not valid.",
            Status = StatusCodes.Status400BadRequest,
            Detail = detail,
        })
        {
            StatusCode = StatusCodes.Status400BadRequest,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult StaleConflict() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/stale-record",
            Title = "The record changed.",
            Status = StatusCodes.Status409Conflict,
            Detail = "This request was changed by someone else since you loaded it. Refresh and reapply your edits.",
        })
        {
            StatusCode = StatusCodes.Status409Conflict,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult RecordOnHoldConflict() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/record-on-hold",
            Title = "This record is on hold.",
            Status = StatusCodes.Status409Conflict,
            Detail = "Reactivate the record from its Status tab before continuing.",
        })
        {
            StatusCode = StatusCodes.Status409Conflict,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult GateAlreadyOpenConflict() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/gate-already-open",
            Title = "A gate is already open.",
            Status = StatusCodes.Status409Conflict,
            Detail = "An approval gate is already open on this record. Resolve it before moving the stage again.",
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
            Detail = "You do not have access to this request.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult LockedField() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/platform-defined-field-locked",
            Title = "This field is locked.",
            Status = StatusCodes.Status403Forbidden,
            Detail = "This field is read-only — a crossing field frozen on escalation, or a platform-defined field.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };
}

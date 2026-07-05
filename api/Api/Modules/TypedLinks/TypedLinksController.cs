// TypedLinks + Copy endpoints (Slice 10 — api-contracts.md §9). Record-scoped link ops resolve
// access inside the service (a forbidden OR non-existent record both come back as 403, never 404 —
// BS §22.6). The controller only routes / validates / authorizes and maps the service result to a
// status code (api-coding-standards.md — no business logic in controllers).

using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.TypedLinks;

[ApiController]
[Route("api/v1")]
public sealed class TypedLinksController : ControllerBase
{
    private readonly ITypedLinksService _links;
    private readonly ICopyService _copy;
    private readonly ICurrentUser _currentUser;

    public TypedLinksController(ITypedLinksService links, ICopyService copy, ICurrentUser currentUser)
    {
        _links = links;
        _copy = copy;
        _currentUser = currentUser;
    }

    /// <summary>List a record's outgoing typed links — the Relationships card (Viewer+ on the record).</summary>
    [HttpGet("records/{recordId}/links")]
    [ProducesResponseType(typeof(IReadOnlyList<TypedLinkDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetLinks([FromRoute] string recordId, CancellationToken cancellationToken)
    {
        var links = await _links.GetLinksAsync(recordId, _currentUser.UserId, cancellationToken);
        return links is null ? AccessDenied() : Ok(links);
    }

    /// <summary>Add a typed link from the record to another (Member+ on the record's workspace, via the service).</summary>
    [HttpPost("records/{recordId}/links")]
    [ProducesResponseType(typeof(TypedLinkDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> AddLink(
        [FromRoute] string recordId,
        [FromBody] AddLinkRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _links.AddLinkAsync(recordId, request, _currentUser.UserId, OperationId(), cancellationToken);
        return result.Outcome switch
        {
            AddLinkOutcome.Created => Created($"/api/v1/records/{recordId}/links", result.Link),
            AddLinkOutcome.Invalid => ValidationFailure(result.Errors!),
            _ => AccessDenied(),
        };
    }

    /// <summary>Soft-delete a typed link (gated on the caller seeing the link's FROM record).</summary>
    [HttpDelete("links/{linkId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> DeleteLink([FromRoute] Guid linkId, CancellationToken cancellationToken)
    {
        var deleted = await _links.DeleteLinkAsync(linkId, _currentUser.UserId, OperationId(), cancellationToken);
        return deleted ? NoContent() : AccessDenied();
    }

    /// <summary>Copy a record into a fresh draft in a target workspace (Member+ on both sides, via the service).</summary>
    [HttpPost("records/{recordId}/copy")]
    [ProducesResponseType(typeof(CopyResult), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Copy(
        [FromRoute] string recordId,
        [FromBody] CopyRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _copy.CopyAsync(recordId, request, _currentUser.UserId, cancellationToken);
        return result.Outcome switch
        {
            CopyOutcome.Success => Created($"/api/v1/drafts/{result.DraftId}", new CopyResult(result.DraftId!.Value)),
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
            Detail = "You do not have access to this record.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };
}

// Record-links endpoints (Slice 25 — api-contracts.md §Relationships records-side).
// Powers the Relationships side panel on S4/S5 and the config-driven relationship-driven tabs.
//
// Access model: workspace membership.
//   • GET /records/{recordId}/links      → Viewer+ (any member).
//   • POST /records/{recordId}/links     → Member+ (creators can link).
//   • DELETE /records/{recordId}/links/{linkId} → Member+.
//
// WorkspaceId is required as a query parameter (the caller already resolves it on the
// active record). The controller trusts the caller-supplied workspaceId is the record's
// own workspace on that side (an escalated record has two sides — links are per-side).

using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Relationships;

[ApiController]
[Route("api/v1")]
public sealed class RecordLinksController : ControllerBase
{
    private readonly IRelationshipsService _service;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public RecordLinksController(
        IRelationshipsService service, IAccessGuard accessGuard, ICurrentUser currentUser)
    {
        _service = service;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>List relationship-driven links touching this record (both directions). Viewer+.
    /// Path is /relationship-links (not /links) to avoid the route collision with Slice 10's
    /// TypedLinksController (POST /records/{recordId}/links). See the slice doc for the decision.</summary>
    [HttpGet("records/{recordId}/relationship-links")]
    [ProducesResponseType(typeof(IReadOnlyList<RelationshipLinkDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> List(
        [FromRoute] string recordId,
        [FromQuery] Guid workspaceId,
        [FromQuery] Guid? relationshipId,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(
                _currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        var links = await _service.ListRecordLinksAsync(workspaceId, recordId, relationshipId, cancellationToken);
        return Ok(links);
    }

    /// <summary>Create a relationship-driven link from this record to another. Member+.</summary>
    [HttpPost("records/{recordId}/relationship-links")]
    [ProducesResponseType(typeof(RelationshipLinkDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create(
        [FromRoute] string recordId,
        [FromQuery] Guid workspaceId,
        [FromBody] RelationshipLinkCreateRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.ToRecordId))
        {
            ModelState.AddModelError("toRecordId", "Target record is required.");
            return ValidationProblem();
        }

        if (string.Equals(recordId, request.ToRecordId, StringComparison.OrdinalIgnoreCase))
        {
            ModelState.AddModelError("toRecordId", "A record cannot link to itself.");
            return ValidationProblem();
        }

        if (!await _accessGuard.HasWorkspaceLevelAsync(
                _currentUser.UserId, workspaceId, WorkspaceLevel.Member, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _service.CreateRecordLinkAsync(
            workspaceId, recordId, request.RelationshipId, request.ToRecordId, _currentUser.UserId, cancellationToken);

        return result.Outcome switch
        {
            RelationshipMutationOutcome.Success =>
                Created($"/api/v1/records/{recordId}/relationship-links/{result.Link!.Id}", result.Link),
            RelationshipMutationOutcome.NotFound => NotFound(),
            RelationshipMutationOutcome.InvalidState =>
                ConflictProblem(result.Detail ?? "Relationship state does not allow this link."),
            _ => AccessDenied(),
        };
    }

    /// <summary>Soft-delete a relationship-driven link. Member+.</summary>
    [HttpDelete("records/{recordId}/relationship-links/{linkId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Delete(
        [FromRoute] string recordId,
        [FromRoute] Guid linkId,
        [FromQuery] Guid workspaceId,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(
                _currentUser.UserId, workspaceId, WorkspaceLevel.Member, cancellationToken))
        {
            return AccessDenied();
        }

        // v2 review F-2 (A01 path-scoping bypass): the proc validates that {recordId} on the route
        // matches one endpoint of the link. If it doesn't, the service returns NotFound → 404 here.
        var result = await _service.DeleteRecordLinkAsync(
            linkId, workspaceId, recordId, _currentUser.UserId, cancellationToken);

        return result.Outcome switch
        {
            RelationshipMutationOutcome.Success => NoContent(),
            RelationshipMutationOutcome.NotFound => NotFound(),
            _ => AccessDenied(),
        };
    }

    private ObjectResult ConflictProblem(string detail) =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/conflict",
            Title = "Relationship state does not allow this action.",
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
            Detail = "You do not have access to this record.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };

    private new BadRequestObjectResult ValidationProblem() =>
        new(new ValidationProblemDetails(ModelState)
        {
            Type = "https://mws.ai/errors/validation",
            Title = "The link is not valid.",
            Status = StatusCodes.Status400BadRequest,
        })
        {
            ContentTypes = { "application/problem+json" },
        };
}

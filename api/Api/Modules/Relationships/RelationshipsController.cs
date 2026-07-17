// Relationships endpoints (Slice 25 — api-contracts.md §Relationships).
//   • Admin (WorkspaceAdmin): GET/POST /workspaces/{id}/relationships, GET/PATCH /relationships/{id},
//     POST /relationships/{id}/retire, POST /relationships/{id}/restore.
//   • Any workspace member (Viewer+): GET /records/{recordId}/links, POST /records/{recordId}/links,
//     DELETE /records/{recordId}/links/{linkId}. Access is workspace-membership; the controller
//     resolves the record's WorkspaceId before gating.
//
// The controller routes and gates; the service (RelationshipsService) does the work. Access
// violations return 403 (never 404) per BS §22.6.

using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Relationships;

[ApiController]
[Route("api/v1")]
public sealed class RelationshipsController : ControllerBase
{
    private readonly IRelationshipsService _service;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public RelationshipsController(
        IRelationshipsService service, IAccessGuard accessGuard, ICurrentUser currentUser)
    {
        _service = service;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>List Relationships for a workspace. Viewer+ (any member).</summary>
    [HttpGet("workspaces/{workspaceId:guid}/relationships")]
    [ProducesResponseType(typeof(IReadOnlyList<RelationshipDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> List(
        [FromRoute] Guid workspaceId, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(
                _currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        var relationships = await _service.ListAsync(workspaceId, cancellationToken);
        return Ok(relationships);
    }

    /// <summary>Get one Relationship. Viewer+.</summary>
    [HttpGet("relationships/{relationshipId:guid}")]
    [ProducesResponseType(typeof(RelationshipDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(
        [FromRoute] Guid relationshipId,
        [FromQuery] Guid workspaceId,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(
                _currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        var relationship = await _service.GetByIdAsync(relationshipId, workspaceId, cancellationToken);
        return relationship is null ? NotFound() : Ok(relationship);
    }

    /// <summary>Create a Relationship (auto-provisions Link-to-record fields). WorkspaceAdmin.</summary>
    [HttpPost("workspaces/{workspaceId:guid}/relationships")]
    [ProducesResponseType(typeof(RelationshipDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Create(
        [FromRoute] Guid workspaceId,
        [FromBody] RelationshipCreateRequest request,
        CancellationToken cancellationToken)
    {
        var validationError = ValidateCreate(request);
        if (validationError is not null) return validationError;

        if (!await _accessGuard.HasWorkspaceLevelAsync(
                _currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _service.CreateAsync(workspaceId, request, _currentUser.UserId, cancellationToken);
        return MapMutation(result, StatusCodes.Status201Created);
    }

    /// <summary>Patch a Relationship's mutable fields. WorkspaceAdmin.</summary>
    [HttpPatch("relationships/{relationshipId:guid}")]
    [ProducesResponseType(typeof(RelationshipDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Update(
        [FromRoute] Guid relationshipId,
        [FromQuery] Guid workspaceId,
        [FromBody] RelationshipPatchRequest request,
        CancellationToken cancellationToken)
    {
        // The Create-side invariant "showOnFromAsTab=true requires tabLabel" must hold on PATCH too —
        // otherwise a caller can toggle the tab on with a blank label and the tab bar silently falls
        // back to fromSideLabel. Only validate when the caller is actually touching either field.
        if (request.ShowOnFromAsTab.HasValue || request.TabLabel is not null)
        {
            var validationError = ValidateShowAsTabHasLabel(request.ShowOnFromAsTab, request.TabLabel);
            if (validationError is not null) return validationError;
        }

        if (!await _accessGuard.HasWorkspaceLevelAsync(
                _currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _service.UpdateAsync(relationshipId, workspaceId, request, _currentUser.UserId, cancellationToken);
        return MapMutation(result, StatusCodes.Status200OK);
    }

    /// <summary>Shared invariant: when ShowOnFromAsTab is being enabled (or true already), TabLabel must be non-empty.
    /// Returns a 400 BadRequestObjectResult when the invariant is violated, else null. Used by Create + Update.</summary>
    private BadRequestObjectResult? ValidateShowAsTabHasLabel(bool? showOnFromAsTab, string? tabLabel)
    {
        // PATCH may send just `showOnFromAsTab: true` (no tabLabel) — needs an existing label.
        // Since the service resolves the existing label before persisting, only fail on an
        // *explicit* blank tabLabel paired with an explicit or effective show-as-tab. The service
        // layer sees the merged post-patch state and re-validates there for the "toggle on with no
        // existing label" case; controllers can only guard on the request-shape invariant here.
        if ((showOnFromAsTab ?? false) && tabLabel is not null && string.IsNullOrWhiteSpace(tabLabel))
        {
            ModelState.AddModelError("tabLabel", "Tab label is required when Show as tab is enabled.");
            return new BadRequestObjectResult(new ValidationProblemDetails(ModelState)
            {
                Type = "https://mws.ai/errors/validation",
                Title = "The relationship is not valid.",
                Status = StatusCodes.Status400BadRequest,
            })
            {
                ContentTypes = { "application/problem+json" },
            };
        }
        return null;
    }

    /// <summary>Retire a Relationship (soft). With links present and force=false, 409.</summary>
    [HttpPost("relationships/{relationshipId:guid}/retire")]
    [ProducesResponseType(typeof(RelationshipRetireResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RelationshipRetireResponse), StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Retire(
        [FromRoute] Guid relationshipId,
        [FromQuery] Guid workspaceId,
        [FromQuery] bool force = false,
        CancellationToken cancellationToken = default)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(
                _currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _service.RetireAsync(
            relationshipId, workspaceId, force, _currentUser.UserId, cancellationToken);

        // Branch on the Outcome discriminator (v2 slice-25 review F-4). Missing → 404. System-block → 409.
        switch (result.Outcome)
        {
            case RelationshipMutationOutcome.NotFound:
                return NotFound();
            case RelationshipMutationOutcome.InvalidState:
                return ConflictProblem(result.Detail ?? "Relationship state does not allow this action.");
        }

        var response = result.Response!;
        // Not retired + LinkCount > 0 → the proc blocked because of live links → 409 with the count payload.
        if (!response.Retired && response.LinkCount > 0)
        {
            return new ObjectResult(response)
            {
                StatusCode = StatusCodes.Status409Conflict,
                ContentTypes = { "application/json" },
            };
        }

        return Ok(response);
    }

    /// <summary>Restore a soft-retired Relationship. WorkspaceAdmin.</summary>
    [HttpPost("relationships/{relationshipId:guid}/restore")]
    [ProducesResponseType(typeof(RelationshipDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Restore(
        [FromRoute] Guid relationshipId,
        [FromQuery] Guid workspaceId,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(
                _currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _service.RestoreAsync(relationshipId, workspaceId, _currentUser.UserId, cancellationToken);
        return MapMutation(result, StatusCodes.Status200OK);
    }

    private IActionResult MapMutation(RelationshipMutationResult result, int successStatus)
    {
        return result.Outcome switch
        {
            RelationshipMutationOutcome.Success => successStatus == StatusCodes.Status201Created
                ? Created($"/api/v1/relationships/{result.Relationship!.Id}?workspaceId={result.Relationship.WorkspaceId}", result.Relationship)
                : Ok(result.Relationship),
            RelationshipMutationOutcome.NotFound => NotFound(),
            RelationshipMutationOutcome.InvalidState => ConflictProblem(result.Detail ?? "Relationship is in an invalid state for this action."),
            _ => AccessDenied(),
        };
    }

    private BadRequestObjectResult? ValidateCreate(RelationshipCreateRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(request.Name))
            errors["name"] = new[] { "Name is required." };
        if (string.IsNullOrWhiteSpace(request.FromObjectType))
            errors["fromObjectType"] = new[] { "From object type is required." };
        if (string.IsNullOrWhiteSpace(request.ToObjectType))
            errors["toObjectType"] = new[] { "To object type is required." };
        if (request.Cardinality is not ("OneToOne" or "OneToMany" or "ManyToMany"))
            errors["cardinality"] = new[] { "Cardinality must be OneToOne, OneToMany, or ManyToMany." };
        if (string.IsNullOrWhiteSpace(request.FromSideLabel))
            errors["fromSideLabel"] = new[] { "From-side label is required." };
        if (string.IsNullOrWhiteSpace(request.ToSideLabel))
            errors["toSideLabel"] = new[] { "To-side label is required." };
        if ((request.ShowOnFromAsTab ?? false) && string.IsNullOrWhiteSpace(request.TabLabel))
            errors["tabLabel"] = new[] { "Tab label is required when Show as tab is enabled." };

        if (errors.Count == 0) return null;

        foreach (var (field, messages) in errors)
            foreach (var msg in messages)
                ModelState.AddModelError(field, msg);

        return new BadRequestObjectResult(new ValidationProblemDetails(ModelState)
        {
            Type = "https://mws.ai/errors/validation",
            Title = "The relationship is not valid.",
            Status = StatusCodes.Status400BadRequest,
        })
        {
            ContentTypes = { "application/problem+json" },
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
            Detail = "You do not have access to this relationship.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };
}

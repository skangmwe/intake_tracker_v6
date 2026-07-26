// Platform Fields & objects — Objects / Relationships tab (S34, B2; Global custom objects, SP3b). The
// Fields tab is served by PlatformFieldsController; this controller adds the two remaining tabs:
//   • GET/POST/PATCH/DELETE /platform/objects — the Global object types (built-in Request/Task,
//                                     read-only; plus Global custom objects a platform admin manages).
//   • GET /platform/relationships  — the canonical system-seeded relationships every workspace
//                                     inherits, de-duplicated across workspaces, read-only.
// Every endpoint verifies the caller carries the Platform-admin grant; a non-admin gets 403 (never
// 404). The controller only routes / validates / authorizes and maps the service result to a status.

using McDermott.AiTracker.Api.Modules.Objects;
using McDermott.AiTracker.Api.Modules.Relationships;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.PlatformAdmin;

[ApiController]
[Route("api/v1/platform")]
public sealed class PlatformSchemaController : ControllerBase
{
    private readonly IObjectSchemaService _objects;
    private readonly IRelationshipsService _relationships;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public PlatformSchemaController(
        IObjectSchemaService objects,
        IRelationshipsService relationships,
        IAccessGuard accessGuard,
        ICurrentUser currentUser)
    {
        _objects = objects;
        _relationships = relationships;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>Every Global object type for the platform Objects tab: the Global built-ins (Request,
    /// Task, read-only) and Global custom objects (S34 / SP3b).</summary>
    [HttpGet("objects")]
    [ProducesResponseType(typeof(IReadOnlyList<ObjectDefinitionDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetObjects(CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return AccessDenied();
        }

        var objects = await _objects.ListGlobalAsync(cancellationToken);
        return Ok(objects);
    }

    /// <summary>Create a Global custom object (platform admin). Location is always Global.</summary>
    [HttpPost("objects")]
    [ProducesResponseType(typeof(ObjectDefinitionDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CreateObject(
        [FromBody] ObjectDefinitionCreateRequest request, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return AccessDenied();
        }

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return NameRequired();
        }

        var result = await _objects.CreateGlobalAsync(request, _currentUser.UserId, cancellationToken);
        return MapMutation(result);
    }

    /// <summary>Patch a Global custom object (platform admin). A built-in or local id returns 404.</summary>
    [HttpPatch("objects/{objectId:guid}")]
    [ProducesResponseType(typeof(ObjectDefinitionDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> UpdateObject(
        [FromRoute] Guid objectId,
        [FromBody] ObjectDefinitionPatchRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return AccessDenied();
        }

        if (request.Name is not null && string.IsNullOrWhiteSpace(request.Name))
        {
            return NameRequired();
        }

        var result = await _objects.UpdateGlobalAsync(objectId, request, _currentUser.UserId, cancellationToken);
        return MapMutation(result);
    }

    /// <summary>Soft-delete a Global custom object (platform admin). A built-in or local id returns 404.</summary>
    [HttpDelete("objects/{objectId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteObject(
        [FromRoute] Guid objectId, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _objects.DeleteGlobalAsync(objectId, _currentUser.UserId, cancellationToken);
        return result.Outcome switch
        {
            ObjectMutationOutcome.Success => NoContent(),
            ObjectMutationOutcome.NotFound => NotFound(),
            _ => ConflictProblem(result.Detail ?? "Object is in an invalid state for this action."),
        };
    }

    /// <summary>The canonical system-seeded relationships every workspace inherits, de-duplicated
    /// across workspaces — read-only reference (S34 Relationships). No workspace scope.</summary>
    [HttpGet("relationships")]
    [ProducesResponseType(typeof(IReadOnlyList<RelationshipDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetRelationships(CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return AccessDenied();
        }

        var relationships = await _relationships.ListPlatformSystemAsync(cancellationToken);
        return Ok(relationships);
    }

    // Success returns 200 with the object (create and patch alike — a Global object has no workspace
    // route to point a 201 Location at). InvalidState is a duplicate name → 409.
    private IActionResult MapMutation(ObjectMutationResult result) =>
        result.Outcome switch
        {
            ObjectMutationOutcome.Success => Ok(result.Object),
            ObjectMutationOutcome.NotFound => NotFound(),
            ObjectMutationOutcome.InvalidState =>
                ConflictProblem(result.Detail ?? "An object with this name already exists."),
            _ => AccessDenied(),
        };

    private BadRequestObjectResult NameRequired()
    {
        ModelState.AddModelError("name", "Name is required.");
        return new BadRequestObjectResult(new ValidationProblemDetails(ModelState)
        {
            Type = "https://mws.ai/errors/validation",
            Title = "The object is not valid.",
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
            Title = "Object state does not allow this action.",
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
            Detail = "Only a Platform admin can view or manage the platform object and relationship schema.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };
}

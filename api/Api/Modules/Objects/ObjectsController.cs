// Objects endpoints (Slice — Objects tab, S30 Fields & objects → Objects).
//   • Reads (Viewer+): GET /workspaces/{id}/objects.
//   • Writes (WorkspaceAdmin): POST /workspaces/{id}/objects, PATCH /objects/{id}, DELETE /objects/{id}.
// The controller routes, validates, and gates; ObjectSchemaService does the work. Access violations
// return 403 (never 404). Built-in objects are read-only — the write procs only touch custom rows,
// so a write against a built-in id returns 404 (it is not a stored row).

using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Objects;

[ApiController]
[Route("api/v1")]
public sealed class ObjectsController : ControllerBase
{
    // Workspaces can only ever author LOCAL objects. "Global" means platform-owned
    // (WorkspaceId IS NULL) — Global objects are created only via PlatformSchemaController /
    // ObjectSchemaService, never through this workspace-scoped controller.
    private static readonly string[] WorkspaceCreatableLocations = ["LocalWorkspace"];

    private readonly IObjectSchemaService _service;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public ObjectsController(
        IObjectSchemaService service, IAccessGuard accessGuard, ICurrentUser currentUser)
    {
        _service = service;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>List object types for a workspace (built-ins + custom). Viewer+.</summary>
    [HttpGet("workspaces/{workspaceId:guid}/objects")]
    [ProducesResponseType(typeof(IReadOnlyList<ObjectDefinitionDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> List(
        [FromRoute] Guid workspaceId, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(
                _currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        var objects = await _service.ListAsync(workspaceId, cancellationToken);
        return Ok(objects);
    }

    /// <summary>Create a custom object. WorkspaceAdmin.</summary>
    [HttpPost("workspaces/{workspaceId:guid}/objects")]
    [ProducesResponseType(typeof(ObjectDefinitionDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create(
        [FromRoute] Guid workspaceId,
        [FromBody] ObjectDefinitionCreateRequest request,
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

    /// <summary>Patch a custom object's fields. WorkspaceAdmin.</summary>
    [HttpPatch("objects/{objectId:guid}")]
    [ProducesResponseType(typeof(ObjectDefinitionDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Update(
        [FromRoute] Guid objectId,
        [FromQuery] Guid workspaceId,
        [FromBody] ObjectDefinitionPatchRequest request,
        CancellationToken cancellationToken)
    {
        // Validate only fields the caller is actually setting (sparse patch).
        if (request.Location is not null && !WorkspaceCreatableLocations.Contains(request.Location))
        {
            return LocationProblem();
        }
        if (request.Name is not null && string.IsNullOrWhiteSpace(request.Name))
        {
            return NameProblem();
        }

        if (!await _accessGuard.HasWorkspaceLevelAsync(
                _currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _service.UpdateAsync(objectId, workspaceId, request, _currentUser.UserId, cancellationToken);
        return MapMutation(result, StatusCodes.Status200OK);
    }

    /// <summary>Delete (soft) a custom object. WorkspaceAdmin. Built-in ids return 404.</summary>
    [HttpDelete("objects/{objectId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(
        [FromRoute] Guid objectId,
        [FromQuery] Guid workspaceId,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(
                _currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _service.DeleteAsync(objectId, workspaceId, _currentUser.UserId, cancellationToken);
        return result.Outcome switch
        {
            ObjectMutationOutcome.Success => NoContent(),
            ObjectMutationOutcome.NotFound => NotFound(),
            _ => ConflictProblem(result.Detail ?? "Object is in an invalid state for this action."),
        };
    }

    private IActionResult MapMutation(ObjectMutationResult result, int successStatus)
    {
        return result.Outcome switch
        {
            ObjectMutationOutcome.Success => successStatus == StatusCodes.Status201Created
                ? Created($"/api/v1/objects/{result.Object!.Id}?workspaceId={result.Object.WorkspaceId}", result.Object)
                : Ok(result.Object),
            ObjectMutationOutcome.NotFound => NotFound(),
            ObjectMutationOutcome.InvalidState => ConflictProblem(result.Detail ?? "Object is in an invalid state for this action."),
            _ => AccessDenied(),
        };
    }

    private BadRequestObjectResult? ValidateCreate(ObjectDefinitionCreateRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(request.Name))
            errors["name"] = ["Name is required."];
        if (!WorkspaceCreatableLocations.Contains(request.Location))
            errors["location"] = ["Location must be LocalWorkspace. Workspaces can only create local objects; Global objects are managed by platform admins."];

        if (errors.Count == 0) return null;

        foreach (var (field, messages) in errors)
            foreach (var message in messages)
                ModelState.AddModelError(field, message);

        return ValidationProblem400();
    }

    private BadRequestObjectResult NameProblem()
    {
        ModelState.AddModelError("name", "Name is required.");
        return ValidationProblem400();
    }

    private BadRequestObjectResult LocationProblem()
    {
        ModelState.AddModelError("location", "Location must be LocalWorkspace. Workspaces can only create local objects; Global objects are managed by platform admins.");
        return ValidationProblem400();
    }

    private BadRequestObjectResult ValidationProblem400() =>
        new(new ValidationProblemDetails(ModelState)
        {
            Type = "https://mws.ai/errors/validation",
            Title = "The object is not valid.",
            Status = StatusCodes.Status400BadRequest,
        })
        {
            ContentTypes = { "application/problem+json" },
        };

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
            Detail = "You do not have access to this workspace's objects.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };
}

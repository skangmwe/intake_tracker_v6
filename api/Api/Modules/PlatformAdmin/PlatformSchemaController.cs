// Platform Fields & objects — Objects / Relationships tab reads (S34, B2). The Fields tab is served
// by PlatformFieldsController; this controller adds the two remaining tabs plus the workspace picker
// that scopes the Relationships tab:
//   • GET /platform/objects              — the Global built-in object types (Request, Task), read-only.
//   • GET /platform/workspaces           — the firm-wide workspace list for the picker.
//   • GET /platform/relationships?workspaceId=  — one workspace's relationships, read-only.
// Every endpoint verifies the caller carries the Platform-admin grant; a non-admin gets 403 (never
// 404). The controller only routes / validates / authorizes and delegates to the reused services.

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
    private readonly IPlatformWorkspaceDirectory _workspaces;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public PlatformSchemaController(
        IObjectSchemaService objects,
        IRelationshipsService relationships,
        IPlatformWorkspaceDirectory workspaces,
        IAccessGuard accessGuard,
        ICurrentUser currentUser)
    {
        _objects = objects;
        _relationships = relationships;
        _workspaces = workspaces;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>The Global built-in object types (Request, Task) — read-only reference (S34 Objects).</summary>
    [HttpGet("objects")]
    [ProducesResponseType(typeof(IReadOnlyList<ObjectDefinitionDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetObjects(CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return AccessDenied();
        }

        return Ok(_objects.GetGlobalObjects());
    }

    /// <summary>Every non-deleted workspace — the firm-wide picker for the Relationships tab (S34).</summary>
    [HttpGet("workspaces")]
    [ProducesResponseType(typeof(IReadOnlyList<PlatformWorkspaceDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetWorkspaces(CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return AccessDenied();
        }

        var workspaces = await _workspaces.ListAsync(cancellationToken);
        return Ok(workspaces);
    }

    /// <summary>One workspace's relationships — read-only reference (S34 Relationships). The picked
    /// workspace scopes the list; a Platform admin need not be a member of it.</summary>
    [HttpGet("relationships")]
    [ProducesResponseType(typeof(IReadOnlyList<RelationshipDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetRelationships(
        [FromQuery] Guid workspaceId, CancellationToken cancellationToken)
    {
        if (workspaceId == Guid.Empty)
        {
            ModelState.AddModelError("workspaceId", "workspaceId is required.");
            return new BadRequestObjectResult(new ValidationProblemDetails(ModelState)
            {
                Type = "https://mws.ai/errors/validation",
                Title = "The request is not valid.",
                Status = StatusCodes.Status400BadRequest,
            })
            {
                ContentTypes = { "application/problem+json" },
            };
        }

        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return AccessDenied();
        }

        var relationships = await _relationships.ListAsync(workspaceId, cancellationToken);
        return Ok(relationships);
    }

    private ObjectResult AccessDenied() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/access-denied",
            Title = "Access denied.",
            Status = StatusCodes.Status403Forbidden,
            Detail = "Only a Platform admin can view the platform object and relationship schema.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };
}

// Platform Fields & objects — Objects / Relationships tab reads (S34, B2). The Fields tab is served
// by PlatformFieldsController; this controller adds the two remaining tabs:
//   • GET /platform/objects        — the Global built-in object types (Request, Task), read-only.
//   • GET /platform/relationships  — the canonical system-seeded relationships every workspace
//                                     inherits, de-duplicated across workspaces, read-only.
// Both endpoints verify the caller carries the Platform-admin grant; a non-admin gets 403 (never
// 404). The controller only routes / authorizes and delegates to the reused services.

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

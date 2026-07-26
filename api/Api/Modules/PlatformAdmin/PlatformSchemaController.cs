// Platform Fields & objects — Objects / Relationships tab (S34, B2; Global custom objects, SP3b). The
// Fields tab is served by PlatformFieldsController; this controller adds the two remaining tabs:
//   • GET/POST/PATCH/DELETE /platform/objects — the Global object types (built-in Request/Task,
//                                     read-only; plus Global custom objects a platform admin manages).
//   • POST/PATCH/DELETE /platform/objects/{objectKey}/fields — custom fields on a Global custom
//                                     object (SP3b Slice 2a, Task 4). Delegates to
//                                     IFieldSchemaService.UpsertGlobalObjectFieldAsync /
//                                     RetireGlobalObjectFieldAsync, which already verify objectKey
//                                     resolves to a Global CUSTOM object (NotFound otherwise).
//   • GET /platform/relationships  — the canonical system-seeded relationships every workspace
//                                     inherits, de-duplicated across workspaces, read-only.
// Every endpoint verifies the caller carries the Platform-admin grant; a non-admin gets 403 (never
// 404). The controller only routes / validates / authorizes and maps the service result to a status.

using McDermott.AiTracker.Api.Modules.Fields;
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
    private readonly IFieldSchemaService _fields;
    private readonly IRelationshipsService _relationships;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public PlatformSchemaController(
        IObjectSchemaService objects,
        IFieldSchemaService fields,
        IRelationshipsService relationships,
        IAccessGuard accessGuard,
        ICurrentUser currentUser)
    {
        _objects = objects;
        _fields = fields;
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

    /// <summary>Create a field on a Global custom object (platform admin). <paramref name="objectKey"/>
    /// must resolve to a Global, non-system object — any other value (built-in, LocalWorkspace object,
    /// unknown slug) returns 404, never disclosing which slugs exist.</summary>
    [HttpPost("objects/{objectKey}/fields")]
    [ProducesResponseType(typeof(FieldDefinitionDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CreateField(
        [FromRoute] string objectKey,
        [FromBody] FieldDefinitionUpsertRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _fields.UpsertGlobalObjectFieldAsync(
            objectKey, request, isCreate: true, _currentUser.UserId, cancellationToken);
        return MapFieldMutation(result, isDelete: false);
    }

    /// <summary>Patch a field on a Global custom object (platform admin). The route's fieldKey wins
    /// over whatever the body carries.</summary>
    [HttpPatch("objects/{objectKey}/fields/{fieldKey}")]
    [ProducesResponseType(typeof(FieldDefinitionDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> UpdateField(
        [FromRoute] string objectKey,
        [FromRoute] string fieldKey,
        [FromBody] FieldDefinitionUpsertRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return AccessDenied();
        }

        request.FieldKey = fieldKey;
        var result = await _fields.UpsertGlobalObjectFieldAsync(
            objectKey, request, isCreate: false, _currentUser.UserId, cancellationToken);
        return MapFieldMutation(result, isDelete: false);
    }

    /// <summary>Retire (soft-delete) a field on a Global custom object (platform admin).</summary>
    [HttpDelete("objects/{objectKey}/fields/{fieldKey}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteField(
        [FromRoute] string objectKey,
        [FromRoute] string fieldKey,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _fields.RetireGlobalObjectFieldAsync(objectKey, fieldKey, _currentUser.UserId, cancellationToken);
        return MapFieldMutation(result, isDelete: true);
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

    // Success returns 200 with the field (create and patch) or 204 (delete). NotFound covers both
    // "objectKey isn't a Global custom object" and "fieldKey doesn't exist on it" — the service
    // collapses both into the same outcome, so the caller never learns which. Conflict is a
    // duplicate field key on create. ValidationFailed carries the service's field-shape / dependency
    // errors. ForeignGlobal and PlatformDefined are workspace-path-only outcomes (a foreign-owner or
    // platform-defined guard) that UpsertGlobalObjectFieldAsync/RetireGlobalObjectFieldAsync
    // deliberately skip for the platform path — platform admins own every Global field. They cannot
    // occur here; map them (and any future outcome) to 500 rather than a misleading 409/403 so an
    // unexpected value never gets treated as "the operation succeeded, just conflicted."
    private IActionResult MapFieldMutation(FieldOperationResult result, bool isDelete) =>
        result.Outcome switch
        {
            FieldOperationOutcome.Success => isDelete ? NoContent() : Ok(result.Field),
            FieldOperationOutcome.NotFound => NotFound(),
            FieldOperationOutcome.Conflict => FieldConflictProblem(),
            FieldOperationOutcome.ValidationFailed => FieldValidationProblem(result.Errors),
            _ => FieldUnexpectedStateProblem(),
        };

    private ObjectResult FieldConflictProblem() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/duplicate-field",
            Title = "Field already exists.",
            Status = StatusCodes.Status409Conflict,
            Detail = "A field with this key already exists on this object. Edit it instead of creating a new one.",
        })
        {
            StatusCode = StatusCodes.Status409Conflict,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult FieldValidationProblem(IReadOnlyList<string>? errors) =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/validation",
            Title = "The field configuration is not valid.",
            Status = StatusCodes.Status400BadRequest,
            Detail = errors is { Count: > 0 } ? string.Join(" ", errors) : "The field configuration is not valid.",
        })
        {
            StatusCode = StatusCodes.Status400BadRequest,
            ContentTypes = { "application/problem+json" },
        };

    // Defensive-only branch — see the comment on MapFieldMutation. Never expose which outcome hit
    // this path; the detail is intentionally generic (api-error-handling.md — no internals in errors).
    private ObjectResult FieldUnexpectedStateProblem() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/unexpected-field-state",
            Title = "The field could not be saved.",
            Status = StatusCodes.Status500InternalServerError,
            Detail = "The field is in a state this endpoint does not support.",
        })
        {
            StatusCode = StatusCodes.Status500InternalServerError,
            ContentTypes = { "application/problem+json" },
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

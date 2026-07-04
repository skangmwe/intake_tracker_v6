// Fields & objects admin endpoints (S30 — api-contracts.md §18). Reading the schema needs any
// workspace membership (forms and records render from it); creating/updating/retiring a field or a
// task-library field needs WorkspaceAdmin. The controller only routes/validates/authorizes and maps
// the service result to a status code (api-coding-standards.md — no business logic in controllers).
// Access violations return 403, never 404 (api-error-handling.md).

using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Fields;

[ApiController]
[Route("api/v1/workspaces/{workspaceId:guid}")]
public sealed class FieldsController : ControllerBase
{
    private readonly IFieldSchemaService _fields;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public FieldsController(IFieldSchemaService fields, IAccessGuard accessGuard, ICurrentUser currentUser)
    {
        _fields = fields;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>The workspace's field schema for an object type, plus the platform read-only band.</summary>
    [HttpGet("fields")]
    [ProducesResponseType(typeof(WorkspaceFieldSchemaDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetFields(
        [FromRoute] Guid workspaceId,
        [FromQuery] string objectType = "Request",
        CancellationToken cancellationToken = default)
    {
        if (!IsValidObjectType(objectType))
        {
            return BadRequestProblem("Object type must be one of Request, Task, or Feature.");
        }

        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        var schema = await _fields.GetSchemaAsync(workspaceId, objectType, cancellationToken);
        return Ok(schema);
    }

    /// <summary>Create a workspace field.</summary>
    [HttpPost("fields")]
    [ProducesResponseType(typeof(FieldDefinitionDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CreateField(
        [FromRoute] Guid workspaceId,
        [FromBody] FieldDefinitionUpsertRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _fields.UpsertFieldAsync(workspaceId, request, isCreate: true, _currentUser.UserId, OperationId(), cancellationToken);
        return MapUpsert(result, workspaceId, isCreate: true);
    }

    /// <summary>Update an existing workspace field.</summary>
    [HttpPatch("fields/{fieldKey}")]
    [ProducesResponseType(typeof(FieldDefinitionDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateField(
        [FromRoute] Guid workspaceId,
        [FromRoute] string fieldKey,
        [FromBody] FieldDefinitionUpsertRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        // The route identifies the field; the body's key must agree.
        request.FieldKey = fieldKey;
        var result = await _fields.UpsertFieldAsync(workspaceId, request, isCreate: false, _currentUser.UserId, OperationId(), cancellationToken);
        return MapUpsert(result, workspaceId, isCreate: false);
    }

    /// <summary>Retire a workspace field (configuration retirement, never a delete — BS §4.3).</summary>
    [HttpPost("fields/{fieldKey}/retire")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> RetireField(
        [FromRoute] Guid workspaceId,
        [FromRoute] string fieldKey,
        [FromQuery] string objectType = "Request",
        CancellationToken cancellationToken = default)
    {
        if (!IsValidObjectType(objectType))
        {
            return BadRequestProblem("Object type must be one of Request, Task, or Feature.");
        }

        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _fields.RetireFieldAsync(workspaceId, objectType, fieldKey, _currentUser.UserId, OperationId(), cancellationToken);
        return result.Outcome switch
        {
            FieldOperationOutcome.Success => NoContent(),
            FieldOperationOutcome.NotFound => NotFound(),
            FieldOperationOutcome.PlatformDefined => PlatformFieldLocked(),
            FieldOperationOutcome.ValidationFailed => BadRequestProblem(string.Join(" ", result.Errors ?? Array.Empty<string>())),
            _ => BadRequestProblem("The field could not be retired."),
        };
    }

    /// <summary>The task-level typed-field library for the workspace (S30 field library).</summary>
    [HttpGet("task-fields")]
    [ProducesResponseType(typeof(IReadOnlyList<TaskLibraryFieldDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetTaskFields([FromRoute] Guid workspaceId, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        var library = await _fields.GetTaskLibraryAsync(workspaceId, cancellationToken);
        return Ok(library);
    }

    /// <summary>Add a task-library field (admins extend the library; analysts pick from it — S30).</summary>
    [HttpPost("task-fields")]
    [ProducesResponseType(typeof(FieldDefinitionDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CreateTaskField(
        [FromRoute] Guid workspaceId,
        [FromBody] TaskLibraryFieldUpsertRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _fields.UpsertTaskLibraryFieldAsync(workspaceId, request, isCreate: true, _currentUser.UserId, OperationId(), cancellationToken);
        return MapUpsert(result, workspaceId, isCreate: true);
    }

    private IActionResult MapUpsert(FieldOperationResult result, Guid workspaceId, bool isCreate) => result.Outcome switch
    {
        FieldOperationOutcome.Success when isCreate =>
            Created($"/api/v1/workspaces/{workspaceId}/fields/{result.Field!.FieldKey}", result.Field),
        FieldOperationOutcome.Success => Ok(result.Field),
        FieldOperationOutcome.Conflict => Conflict(new ProblemDetails
        {
            Type = "https://mws.ai/errors/duplicate-field",
            Title = "Field already exists.",
            Status = StatusCodes.Status409Conflict,
            Detail = "A field with this key already exists in this workspace. Edit it instead of creating a new one.",
        }),
        FieldOperationOutcome.NotFound => NotFound(),
        FieldOperationOutcome.PlatformDefined => PlatformFieldLocked(),
        FieldOperationOutcome.ValidationFailed => BadRequestProblem(string.Join(" ", result.Errors ?? Array.Empty<string>())),
        _ => BadRequestProblem("The field could not be saved."),
    };

    private string OperationId() =>
        HttpContext.Items.TryGetValue(OperationIdMiddleware.HeaderName, out var value) && value is string operationId
            ? operationId
            : string.Empty;

    private static bool IsValidObjectType(string objectType) =>
        objectType is "Request" or "Task" or "Feature";

    private ObjectResult BadRequestProblem(string detail) =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/validation",
            Title = "The field configuration is not valid.",
            Status = StatusCodes.Status400BadRequest,
            Detail = detail,
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
            Detail = "You do not have permission to manage fields in this workspace.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult PlatformFieldLocked() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/platform-defined-field-locked",
            Title = "Platform-defined field.",
            Status = StatusCodes.Status403Forbidden,
            Detail = "This field is defined centrally and can only be changed by a Platform admin.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };
}

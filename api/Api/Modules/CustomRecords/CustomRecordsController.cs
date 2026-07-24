// Custom-object record endpoints (Slice 1b). Workspace-scoped CRUD for the records of a custom
// object. The controller only routes / authorizes / maps the service outcome to a status code
// (api-coding-standards.md — no business logic in controllers). Access is authorized here against the
// route workspace (Viewer for reads, Member for writes); the service resolves object/record existence
// (a foreign or absent object/record → 404, never disclosing existence — api-record-access.md).

using McDermott.AiTracker.Api.Modules.Requests; // PaginatedResponse<T>, PaginatedQuery
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.CustomRecords;

[ApiController]
[Route("api/v1")]
public sealed class CustomRecordsController : ControllerBase
{
    private readonly ICustomRecordsService _records;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public CustomRecordsController(ICustomRecordsService records, IAccessGuard accessGuard, ICurrentUser currentUser)
    {
        _records = records;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>Create a record of a custom object (Member+).</summary>
    [HttpPost("workspaces/{workspaceId:guid}/objects/{objectId:guid}/records")]
    [ProducesResponseType(typeof(CustomRecordDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Create(
        [FromRoute] Guid workspaceId,
        [FromRoute] Guid objectId,
        [FromBody] CustomRecordWriteRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Member, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _records.CreateAsync(workspaceId, objectId, request, _currentUser.UserId, cancellationToken);
        return result.Outcome switch
        {
            CustomRecordWriteOutcome.Success => Created(
                $"/api/v1/workspaces/{workspaceId}/objects/{objectId}/records/{result.Record!.Id}", result.Record),
            CustomRecordWriteOutcome.ValidationFailed => ValidationFailure(result.Errors!),
            _ => NotFoundProblem(),
        };
    }

    /// <summary>Query the object's records — filter/sort/page payload (Viewer+).</summary>
    [HttpPost("workspaces/{workspaceId:guid}/objects/{objectId:guid}/records/query")]
    [ProducesResponseType(typeof(PaginatedResponse<CustomRecordListRow>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Query(
        [FromRoute] Guid workspaceId,
        [FromRoute] Guid objectId,
        [FromBody] PaginatedQuery query,
        CancellationToken cancellationToken)
    {
        if (query.PageSize > MaxPageSize)
        {
            return ValidationFailure(new Dictionary<string, string[]>
            {
                ["pageSize"] = new[] { $"pageSize must not exceed {MaxPageSize}." },
            });
        }

        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        var page = await _records.QueryAsync(workspaceId, objectId, query, cancellationToken);
        return page is null ? NotFoundProblem() : Ok(page);
    }

    /// <summary>The full record (Viewer+). No row means 404 (never disclose).</summary>
    [HttpGet("workspaces/{workspaceId:guid}/objects/{objectId:guid}/records/{recordId:guid}")]
    [ProducesResponseType(typeof(CustomRecordDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(
        [FromRoute] Guid workspaceId,
        [FromRoute] Guid objectId,
        [FromRoute] Guid recordId,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        var record = await _records.GetByIdAsync(workspaceId, objectId, recordId, cancellationToken);
        return record is null ? NotFoundProblem() : Ok(record);
    }

    /// <summary>Update a record's name + field values (Member+). The full field map is replaced.</summary>
    [HttpPatch("workspaces/{workspaceId:guid}/objects/{objectId:guid}/records/{recordId:guid}")]
    [ProducesResponseType(typeof(CustomRecordDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Update(
        [FromRoute] Guid workspaceId,
        [FromRoute] Guid objectId,
        [FromRoute] Guid recordId,
        [FromBody] CustomRecordWriteRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Member, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _records.PatchAsync(workspaceId, objectId, recordId, request, _currentUser.UserId, cancellationToken);
        return result.Outcome switch
        {
            CustomRecordWriteOutcome.Success => Ok(result.Record),
            CustomRecordWriteOutcome.ValidationFailed => ValidationFailure(result.Errors!),
            _ => NotFoundProblem(),
        };
    }

    /// <summary>Soft-delete a record (Member+).</summary>
    [HttpDelete("workspaces/{workspaceId:guid}/objects/{objectId:guid}/records/{recordId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(
        [FromRoute] Guid workspaceId,
        [FromRoute] Guid objectId,
        [FromRoute] Guid recordId,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Member, cancellationToken))
        {
            return AccessDenied();
        }

        var outcome = await _records.DeleteAsync(workspaceId, objectId, recordId, _currentUser.UserId, cancellationToken);
        return outcome == CustomRecordWriteOutcome.Success ? NoContent() : NotFoundProblem();
    }

    /// <summary>Pagination ceiling (api/CLAUDE.md — requests above this are rejected, never clamped).</summary>
    private const int MaxPageSize = 100;

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
            Detail = "You do not have access to this workspace.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult NotFoundProblem() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/not-found",
            Title = "Not found.",
            Status = StatusCodes.Status404NotFound,
            Detail = "That record or object could not be found.",
        })
        {
            StatusCode = StatusCodes.Status404NotFound,
            ContentTypes = { "application/problem+json" },
        };
}

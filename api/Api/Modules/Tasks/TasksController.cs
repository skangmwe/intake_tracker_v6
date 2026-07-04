// Tasks endpoints (Slice 7 — api-contracts.md §5). Record-scoped task ops resolve access inside the
// service (a forbidden OR non-existent parent both come back null → 403, never 404 — BS §22.6). The
// workspace-scoped bundle-template read is gated by the access guard (Viewer+). The controller only
// routes / validates / authorizes and maps the service result to a status code (api-coding-standards.md
// — no business logic in controllers).

using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Tasks;

[ApiController]
[Route("api/v1")]
public sealed class TasksController : ControllerBase
{
    private readonly ITasksService _tasks;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public TasksController(ITasksService tasks, IAccessGuard accessGuard, ICurrentUser currentUser)
    {
        _tasks = tasks;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>List a record's tasks (Viewer+ on the record's workspace).</summary>
    [HttpGet("requests/{recordId}/tasks")]
    [ProducesResponseType(typeof(IReadOnlyList<TaskDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetTasks([FromRoute] string recordId, CancellationToken cancellationToken)
    {
        var tasks = await _tasks.GetTasksAsync(recordId, _currentUser.UserId, cancellationToken);
        return tasks is null ? AccessDenied() : Ok(tasks);
    }

    /// <summary>Create a single task or apply a bundle template.</summary>
    [HttpPost("requests/{recordId}/tasks")]
    [ProducesResponseType(typeof(IReadOnlyList<TaskDto>), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> CreateTask(
        [FromRoute] string recordId,
        [FromBody] TaskCreateRequest request,
        CancellationToken cancellationToken)
    {
        if (request.Kind is not ("single" or "bundle"))
        {
            return ValidationFailure("kind", "Specify whether to add a single task or a bundle.");
        }

        var result = await _tasks.CreateAsync(recordId, request, _currentUser.UserId, OperationId(), cancellationToken);
        return result.Outcome switch
        {
            TaskCreateOutcome.Created => Created($"/api/v1/requests/{recordId}/tasks", result.Tasks),
            TaskCreateOutcome.Forbidden => AccessDenied(),
            _ => ValidationProblemFrom(result.Errors),
        };
    }

    /// <summary>Patch a task (check-off, notes, typed-field value, title/phase/assignee).</summary>
    [HttpPatch("tasks/{id:guid}")]
    [ProducesResponseType(typeof(TaskDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> PatchTask(
        [FromRoute] Guid id,
        [FromBody] TaskPatchRequest request,
        CancellationToken cancellationToken)
    {
        var task = await _tasks.PatchAsync(id, request, _currentUser.UserId, OperationId(), cancellationToken);
        return task is null ? AccessDenied() : Ok(task);
    }

    /// <summary>The workspace's task-bundle templates for the composer (Viewer+).</summary>
    [HttpGet("workspaces/{workspaceId:guid}/task-bundles")]
    [ProducesResponseType(typeof(IReadOnlyList<TaskBundleTemplateDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetBundles([FromRoute] Guid workspaceId, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        var bundles = await _tasks.GetBundlesAsync(workspaceId, cancellationToken);
        return Ok(bundles);
    }

    private string OperationId() =>
        HttpContext.Items.TryGetValue(OperationIdMiddleware.HeaderName, out var value) && value is string operationId
            ? operationId
            : string.Empty;

    private ObjectResult ValidationFailure(string field, string message) =>
        ValidationProblemFrom(new Dictionary<string, string[]>(StringComparer.Ordinal) { [field] = new[] { message } });

    private ObjectResult ValidationProblemFrom(IReadOnlyDictionary<string, string[]>? errors)
    {
        var map = (errors ?? new Dictionary<string, string[]>())
            .ToDictionary(entry => entry.Key, entry => entry.Value);
        return new ObjectResult(new ValidationProblemDetails(map)
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
    }

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

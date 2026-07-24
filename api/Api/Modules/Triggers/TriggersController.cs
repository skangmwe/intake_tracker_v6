// Trigger admin CRUD endpoints (slice: triggers-request-authoring, Task 2.1). Managing triggers requires
// WorkspaceAdmin; the controller only routes/validates/authorizes and maps the service result to a status
// code (api-coding-standards.md — no business logic in controllers). Access violations return 403, never
// 404 (api-error-handling.md). Trigger lists are small bounded per-workspace config, so — like the fields
// admin list — they are not paginated (api/CLAUDE.md — bounded reference data may skip pagination).

using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Triggers;

[ApiController]
[Route("api/v1/workspaces/{workspaceId:guid}/triggers")]
public sealed class TriggersController : ControllerBase
{
    private readonly ITriggersService _triggers;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public TriggersController(ITriggersService triggers, IAccessGuard accessGuard, ICurrentUser currentUser)
    {
        _triggers = triggers;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>All triggers in the workspace (admin list).</summary>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<TriggerDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetTriggers([FromRoute] Guid workspaceId, CancellationToken cancellationToken)
    {
        if (!await IsAdminAsync(workspaceId, cancellationToken))
        {
            return AccessDenied();
        }

        return Ok(await _triggers.GetWorkspaceTriggersAsync(workspaceId, cancellationToken));
    }

    /// <summary>One trigger by id.</summary>
    [HttpGet("{triggerId:guid}")]
    [ProducesResponseType(typeof(TriggerDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetTrigger(
        [FromRoute] Guid workspaceId, [FromRoute] Guid triggerId, CancellationToken cancellationToken)
    {
        if (!await IsAdminAsync(workspaceId, cancellationToken))
        {
            return AccessDenied();
        }

        var trigger = await _triggers.GetByIdAsync(workspaceId, triggerId, cancellationToken);
        return trigger is null ? NotFound() : Ok(trigger);
    }

    /// <summary>Create a trigger.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(TriggerDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> CreateTrigger(
        [FromRoute] Guid workspaceId, [FromBody] TriggerUpsertRequest request, CancellationToken cancellationToken)
    {
        if (!await IsAdminAsync(workspaceId, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _triggers.UpsertAsync(workspaceId, triggerId: null, request, _currentUser.UserId.ToString(), cancellationToken);
        return result.Outcome switch
        {
            TriggerUpsertOutcome.Success =>
                Created($"/api/v1/workspaces/{workspaceId}/triggers/{result.Trigger!.TriggerId}", result.Trigger),
            TriggerUpsertOutcome.ValidationFailed => ValidationProblemFrom(result.Errors),
            _ => BadRequestProblem("The trigger could not be created."),
        };
    }

    /// <summary>Update a trigger.</summary>
    [HttpPut("{triggerId:guid}")]
    [ProducesResponseType(typeof(TriggerDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateTrigger(
        [FromRoute] Guid workspaceId,
        [FromRoute] Guid triggerId,
        [FromBody] TriggerUpsertRequest request,
        CancellationToken cancellationToken)
    {
        if (!await IsAdminAsync(workspaceId, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _triggers.UpsertAsync(workspaceId, triggerId, request, _currentUser.UserId.ToString(), cancellationToken);
        return result.Outcome switch
        {
            TriggerUpsertOutcome.Success => Ok(result.Trigger),
            TriggerUpsertOutcome.NotFound => NotFound(),
            TriggerUpsertOutcome.ValidationFailed => ValidationProblemFrom(result.Errors),
            _ => BadRequestProblem("The trigger could not be saved."),
        };
    }

    /// <summary>Delete a trigger.</summary>
    [HttpDelete("{triggerId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteTrigger(
        [FromRoute] Guid workspaceId, [FromRoute] Guid triggerId, CancellationToken cancellationToken)
    {
        if (!await IsAdminAsync(workspaceId, cancellationToken))
        {
            return AccessDenied();
        }

        var outcome = await _triggers.DeleteAsync(workspaceId, triggerId, _currentUser.UserId.ToString(), cancellationToken);
        return outcome == TriggerDeleteOutcome.Deleted ? NoContent() : NotFound();
    }

    private async Task<bool> IsAdminAsync(Guid workspaceId, CancellationToken cancellationToken) =>
        await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken);

    private IActionResult ValidationProblemFrom(IReadOnlyList<string>? errors) =>
        BadRequestProblem(errors is { Count: > 0 } ? string.Join(" ", errors) : "The trigger configuration is not valid.");

    private ObjectResult BadRequestProblem(string detail) =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/validation",
            Title = "The trigger configuration is not valid.",
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
            Detail = "You do not have permission to manage triggers in this workspace.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };
}

// Lifecycle & gates admin endpoints (S31 — api-contracts.md §18). Reading the config needs any
// workspace membership (records and forms render from it); saving the config or editing the
// approver-team roster needs WorkspaceAdmin. The controller only routes/validates/authorizes and
// maps the service result to a status code (api-coding-standards.md — no business logic in
// controllers). Access violations return 403, never 404 (api-error-handling.md).

using McDermott.AiTracker.Api.Modules.PlatformAdmin;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Lifecycle;

[ApiController]
[Route("api/v1/workspaces/{workspaceId:guid}")]
public sealed class LifecycleController : ControllerBase
{
    private readonly ILifecycleService _lifecycle;
    private readonly IRoleLabelsService _roleLabels;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public LifecycleController(
        ILifecycleService lifecycle,
        IRoleLabelsService roleLabels,
        IAccessGuard accessGuard,
        ICurrentUser currentUser)
    {
        _lifecycle = lifecycle;
        _roleLabels = roleLabels;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>The workspace's whole lifecycle/stage/gate config plus the approver-team roster.</summary>
    [HttpGet("lifecycle")]
    [ProducesResponseType(typeof(LifecycleConfigDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetLifecycle([FromRoute] Guid workspaceId, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        var config = await _lifecycle.GetConfigAsync(workspaceId, cancellationToken);
        return Ok(config);
    }

    /// <summary>
    /// The lightweight lifecycle list for the S3 intake "Lifecycle" picker and the S31 dropdown
    /// (v2, slice 27) — id, name, and default marker only. Viewer+.
    /// </summary>
    [HttpGet("lifecycles")]
    [ProducesResponseType(typeof(IReadOnlyList<LifecycleSummaryDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetLifecycles([FromRoute] Guid workspaceId, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        var lifecycles = await _lifecycle.GetSummariesAsync(workspaceId, cancellationToken);
        return Ok(lifecycles);
    }

    /// <summary>Reconcile the whole lifecycle/stage/gate structure (WorkspaceAdmin).</summary>
    [HttpPatch("lifecycle")]
    [ProducesResponseType(typeof(LifecycleConfigDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> SaveLifecycle(
        [FromRoute] Guid workspaceId,
        [FromBody] LifecycleConfigUpdateRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _lifecycle.SaveConfigAsync(workspaceId, request, _currentUser.UserId, OperationId(), cancellationToken);
        return result.Outcome switch
        {
            LifecycleSaveOutcome.Success => Ok(result.Config),
            _ => BadRequestProblem(string.Join(" ", result.Errors ?? Array.Empty<string>())),
        };
    }

    /// <summary>The approver-team roster — every role label with its members.</summary>
    [HttpGet("approver-teams")]
    [ProducesResponseType(typeof(IReadOnlyList<ApproverTeamDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetApproverTeams([FromRoute] Guid workspaceId, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        var teams = await _lifecycle.GetApproverTeamsAsync(workspaceId, cancellationToken);
        return Ok(teams);
    }

    /// <summary>Resolve a typed name/email to a real workspace member and add it to a role (WorkspaceAdmin).</summary>
    [HttpPost("approver-teams")]
    [ProducesResponseType(typeof(ApproverTeamMemberDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> AddApproverMember(
        [FromRoute] Guid workspaceId,
        [FromBody] ApproverTeamAddRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _lifecycle.AddApproverMemberAsync(
            workspaceId, request.RoleLabel!, request.Person!, _currentUser.UserId, OperationId(), cancellationToken);

        return result.Outcome switch
        {
            AddMemberOutcome.Success => Created($"/api/v1/workspaces/{workspaceId}/approver-teams", result.Member),
            AddMemberOutcome.Ambiguous => BadRequestProblem("More than one member matches that name — use the exact email address."),
            _ => BadRequestProblem("No active member of this workspace matches that name or email."),
        };
    }

    /// <summary>Remove a member from a role's approver team (WorkspaceAdmin).</summary>
    [HttpDelete("approver-teams")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> RemoveApproverMember(
        [FromRoute] Guid workspaceId,
        [FromBody] ApproverTeamRemoveRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        await _lifecycle.RemoveApproverMemberAsync(
            workspaceId, request.RoleLabel!, request.UserId, _currentUser.UserId, OperationId(), cancellationToken);
        return NoContent();
    }

    // Team lifecycle (create / rename / retire) operates on the platform-scope role-label catalog:
    // in this model a "team" IS a role label (BS §7.2), so a change here is firm-wide — every
    // workspace's Approver-teams list draws from the same catalog. The workspace-admin surface is
    // authorized here (WorkspaceAdmin); the write itself reuses IRoleLabelsService (no duplicated
    // proc/error logic) which anchors its audit event to the platform audit workspace. Rename and
    // retire are forward-only — existing rosters and past sign-offs keep their captured label.

    /// <summary>Create a new approver team (adds a firm-wide role label). WorkspaceAdmin.</summary>
    [HttpPost("approver-teams/labels")]
    [ProducesResponseType(typeof(RoleLabelResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CreateApproverTeam(
        [FromRoute] Guid workspaceId,
        [FromBody] RoleLabelCreateRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _roleLabels.CreateAsync(request.Label!, _currentUser.UserId, OperationId(), cancellationToken);
        return result.Outcome switch
        {
            RoleLabelWriteOutcome.Success => Created(
                $"/api/v1/workspaces/{workspaceId}/approver-teams/labels/{result.Label!.RoleLabelId}", result.Label),
            RoleLabelWriteOutcome.Duplicate => ConflictProblem("A team with that name already exists."),
            _ => BadRequestProblem("A team name cannot be blank."),
        };
    }

    /// <summary>Rename an approver team (forward-only — history keeps its captured label). WorkspaceAdmin.</summary>
    [HttpPatch("approver-teams/labels/{roleLabelId:guid}")]
    [ProducesResponseType(typeof(RoleLabelResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> RenameApproverTeam(
        [FromRoute] Guid workspaceId,
        [FromRoute] Guid roleLabelId,
        [FromBody] RoleLabelRenameRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _roleLabels.RenameAsync(roleLabelId, request.Label!, _currentUser.UserId, OperationId(), cancellationToken);
        return result.Outcome switch
        {
            RoleLabelWriteOutcome.Success => Ok(result.Label),
            RoleLabelWriteOutcome.Duplicate => ConflictProblem("A team with that name already exists."),
            RoleLabelWriteOutcome.NotFound => NotFoundProblem("That team does not exist."),
            _ => BadRequestProblem("A team name cannot be blank."),
        };
    }

    /// <summary>Delete (retire) an approver team — forward-only, idempotent. WorkspaceAdmin.</summary>
    [HttpDelete("approver-teams/labels/{roleLabelId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> DeleteApproverTeam(
        [FromRoute] Guid workspaceId,
        [FromRoute] Guid roleLabelId,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        await _roleLabels.RetireAsync(roleLabelId, _currentUser.UserId, OperationId(), cancellationToken);
        return NoContent();
    }

    private string OperationId() =>
        HttpContext.Items.TryGetValue(OperationIdMiddleware.HeaderName, out var value) && value is string operationId
            ? operationId
            : string.Empty;

    private ObjectResult BadRequestProblem(string detail) =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/validation",
            Title = "The lifecycle configuration is not valid.",
            Status = StatusCodes.Status400BadRequest,
            Detail = detail,
        })
        {
            StatusCode = StatusCodes.Status400BadRequest,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult ConflictProblem(string detail) =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/conflict",
            Title = "The request conflicts with the current state.",
            Status = StatusCodes.Status409Conflict,
            Detail = detail,
        })
        {
            StatusCode = StatusCodes.Status409Conflict,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult NotFoundProblem(string detail) =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/not-found",
            Title = "The requested resource was not found.",
            Status = StatusCodes.Status404NotFound,
            Detail = detail,
        })
        {
            StatusCode = StatusCodes.Status404NotFound,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult AccessDenied() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/access-denied",
            Title = "Access denied.",
            Status = StatusCodes.Status403Forbidden,
            Detail = "You do not have permission to manage lifecycles in this workspace.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };
}

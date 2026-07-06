// Role-label catalog endpoints (S37 — api-contracts §19, BS §7.2). Platform-admin only (403 never
// 404). GET/POST/PATCH/DELETE — POST adds, PATCH renames, DELETE retires. Rename and retire are
// forward-only; the service and procs never rewrite captured history. The controller authorizes,
// validates at the boundary, and maps the service outcome (api-coding-standards.md).

using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.PlatformAdmin;

[ApiController]
[Route("api/v1/platform/role-labels")]
public sealed class RoleLabelsController : ControllerBase
{
    private readonly IRoleLabelsService _roleLabels;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public RoleLabelsController(IRoleLabelsService roleLabels, IAccessGuard accessGuard, ICurrentUser currentUser)
    {
        _roleLabels = roleLabels;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>The platform-scope gate role-label catalog.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<RoleLabelResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetRoleLabels(CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return Denied();
        }

        return Ok(await _roleLabels.ListAsync(cancellationToken));
    }

    /// <summary>Add a role label.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(RoleLabelResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CreateRoleLabel(
        [FromBody] RoleLabelCreateRequest request, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return Denied();
        }

        var result = await _roleLabels.CreateAsync(request.Label!, _currentUser.UserId, OperationId(), cancellationToken);
        return result.Outcome switch
        {
            RoleLabelWriteOutcome.Success => Created($"/api/v1/platform/role-labels/{result.Label!.RoleLabelId}", result.Label),
            RoleLabelWriteOutcome.Duplicate => PlatformProblems.Conflict("That role label already exists."),
            _ => PlatformProblems.Validation("A role label cannot be blank."),
        };
    }

    /// <summary>Rename a role label (forward-only — history keeps its captured label).</summary>
    [HttpPatch("{roleLabelId:guid}")]
    [ProducesResponseType(typeof(RoleLabelResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> RenameRoleLabel(
        [FromRoute] Guid roleLabelId,
        [FromBody] RoleLabelRenameRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return Denied();
        }

        var result = await _roleLabels.RenameAsync(roleLabelId, request.Label!, _currentUser.UserId, OperationId(), cancellationToken);
        return result.Outcome switch
        {
            RoleLabelWriteOutcome.Success => Ok(result.Label),
            RoleLabelWriteOutcome.Duplicate => PlatformProblems.Conflict("That role label already exists."),
            RoleLabelWriteOutcome.NotFound => PlatformProblems.NotFound("That role label does not exist."),
            _ => PlatformProblems.Validation("A role label cannot be blank."),
        };
    }

    /// <summary>Retire a role label (forward-only, idempotent).</summary>
    [HttpDelete("{roleLabelId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> RetireRoleLabel([FromRoute] Guid roleLabelId, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return Denied();
        }

        await _roleLabels.RetireAsync(roleLabelId, _currentUser.UserId, OperationId(), cancellationToken);
        return NoContent();
    }

    private string OperationId() =>
        HttpContext.Items.TryGetValue(OperationIdMiddleware.HeaderName, out var value) && value is string operationId
            ? operationId
            : string.Empty;

    private ObjectResult Denied() =>
        PlatformProblems.AccessDenied("Only a Platform admin can manage the role-label catalog.");
}

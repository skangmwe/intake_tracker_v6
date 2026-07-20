// Users & access admin endpoints (S29 — api-contracts §2). The whole surface is WorkspaceAdmin-only
// (the blueprint's audience, and the list exposes member PII). The controller only
// routes/validates/authorizes and maps the service outcome to a status code
// (api-coding-standards.md — no business logic in controllers). Access violations return 403, never
// 404 (api-error-handling.md); a pending named-individual sign-off blocks deactivation with 409
// (BS §6.8).

using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Users;

[ApiController]
[Route("api/v1/workspaces/{workspaceId:guid}/members")]
public sealed class MembersController : ControllerBase
{
    private readonly IMembersService _members;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public MembersController(IMembersService members, IAccessGuard accessGuard, ICurrentUser currentUser)
    {
        _members = members;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>The workspace's members with identity, level, last-active, and disabled state.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(MembersListDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> ListMembers([FromRoute] Guid workspaceId, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        var members = await _members.ListAsync(workspaceId, cancellationToken);
        return Ok(members);
    }

    /// <summary>
    /// Add a member by email, invite an unknown email, or change an existing member's level
    /// (WorkspaceAdmin). Returns the outcome: "Member" (joined now) or "Invited" (pending invitation).
    /// </summary>
    [HttpPost]
    [ProducesResponseType(typeof(MembershipUpsertResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> UpsertMember(
        [FromRoute] Guid workspaceId,
        [FromBody] MembershipUpsertRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _members.UpsertAsync(workspaceId, request, _currentUser.UserId, OperationId(), cancellationToken);
        return result.Outcome switch
        {
            MembershipUpsertOutcome.Member => Ok(new MembershipUpsertResponse("Member")),
            MembershipUpsertOutcome.Invited => Ok(new MembershipUpsertResponse("Invited")),
            MembershipUpsertOutcome.AlreadyInvited =>
                ConflictProblem("The invitation cannot be created.", "That email already has a pending invitation to this workspace."),
            _ => BadRequestProblem("More than one user matches that name — use the exact email address."),
        };
    }

    /// <summary>Cancel a pending invitation (WorkspaceAdmin). A missing/other-workspace invite is 403.</summary>
    [HttpDelete("/api/v1/workspaces/{workspaceId:guid}/invitations/{invitationId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> CancelInvitation(
        [FromRoute] Guid workspaceId,
        [FromRoute] Guid invitationId,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _members.CancelInvitationAsync(workspaceId, invitationId, _currentUser.UserId, OperationId(), cancellationToken);
        return result.Outcome switch
        {
            CancelInvitationOutcome.Cancelled => NoContent(),
            // NotFound → 403, never 404 (never disclose whether the invite exists — api-record-access.md).
            _ => AccessDenied(),
        };
    }

    /// <summary>Deactivate a member: disable the account and remove them from this workspace (WorkspaceAdmin).</summary>
    [HttpDelete("{userId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> DeactivateMember(
        [FromRoute] Guid workspaceId,
        [FromRoute] Guid userId,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _members.DeactivateAsync(workspaceId, userId, _currentUser.UserId, OperationId(), cancellationToken);
        return result.Outcome switch
        {
            DeactivateMemberOutcome.Success => NoContent(),
            _ => ConflictProblem(
                "The user cannot be deactivated yet.",
                "This user has a pending individual sign-off. Reassign or resolve it before deactivating them."),
        };
    }

    /// <summary>
    /// Suspend or reactivate a member (WorkspaceAdmin): toggle the disabled flag while keeping them in
    /// the workspace. Suspending a user with a pending individual sign-off is blocked with 409 (BS §6.8).
    /// </summary>
    [HttpPost("{userId:guid}/suspension")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SetSuspension(
        [FromRoute] Guid workspaceId,
        [FromRoute] Guid userId,
        [FromBody] MemberSuspensionRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _members.SetSuspensionAsync(
            workspaceId, userId, request.Suspended!.Value, _currentUser.UserId, OperationId(), cancellationToken);
        return result.Outcome switch
        {
            SetSuspensionOutcome.Success => NoContent(),
            _ => ConflictProblem(
                "The user cannot be suspended yet.",
                "This user has a pending individual sign-off. Reassign or resolve it before suspending them."),
        };
    }

    private string OperationId() =>
        HttpContext.Items.TryGetValue(OperationIdMiddleware.HeaderName, out var value) && value is string operationId
            ? operationId
            : string.Empty;

    private ObjectResult BadRequestProblem(string detail) =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/validation",
            Title = "The membership change is not valid.",
            Status = StatusCodes.Status400BadRequest,
            Detail = detail,
        })
        {
            StatusCode = StatusCodes.Status400BadRequest,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult ConflictProblem(string title, string detail) =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/conflict",
            Title = title,
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
            Detail = "You do not have permission to manage members in this workspace.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };
}

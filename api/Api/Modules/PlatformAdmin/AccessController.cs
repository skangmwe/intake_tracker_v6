// Access-provisioning endpoints (S36 — api-contracts §19, BS §4.2/§4.3). Platform-admin only (403
// never 404). GET lists the privileged-grants directory (PlatformAdmin + WorkspaceAdmin holders);
// POST grants the Platform-admin grant (by id or resolved email); DELETE revokes it. The directory
// exposes user PII, so the whole surface is Platform-admin-gated. The controller authorizes,
// validates the exactly-one-of-id/email rule (Data Annotations on the DTO), and maps the outcome.

using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.PlatformAdmin;

[ApiController]
[Route("api/v1/platform/access")]
public sealed class AccessController : ControllerBase
{
    private readonly IAccessGrantsService _access;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public AccessController(IAccessGrantsService access, IAccessGuard accessGuard, ICurrentUser currentUser)
    {
        _access = access;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>The firm's privileged-grants directory.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(PrivilegedGrantsListResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> ListGrants(CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return Denied();
        }

        return Ok(await _access.ListAsync(cancellationToken));
    }

    /// <summary>Grant the additive Platform-admin grant to a user (by id or resolved email).</summary>
    [HttpPost]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GrantAccess(
        [FromBody] PlatformAdminGrantRequest request, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return Denied();
        }

        var result = await _access.GrantAsync(request, _currentUser.UserId, OperationId(), cancellationToken);
        return result.Outcome switch
        {
            GrantOutcome.Success => NoContent(),
            GrantOutcome.Ambiguous => PlatformProblems.Validation("More than one user matches that name — use the exact email address."),
            _ => PlatformProblems.Validation("No active user matches that name or email."),
        };
    }

    /// <summary>Revoke a user's Platform-admin grant (idempotent).</summary>
    [HttpDelete("{userId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> RevokeAccess([FromRoute] Guid userId, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return Denied();
        }

        await _access.RevokeAsync(userId, _currentUser.UserId, OperationId(), cancellationToken);
        return NoContent();
    }

    private string OperationId() =>
        HttpContext.Items.TryGetValue(OperationIdMiddleware.HeaderName, out var value) && value is string operationId
            ? operationId
            : string.Empty;

    private ObjectResult Denied() =>
        PlatformProblems.AccessDenied("Only a Platform admin can manage firm-wide access grants.");
}

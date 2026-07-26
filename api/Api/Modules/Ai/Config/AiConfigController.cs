// Workspace AI-assist config endpoints (Phase 4, §14). Reading the config needs any workspace
// membership (the SPA uses `enabled` to show/hide the Ask entry); changing it needs WorkspaceAdmin.
// The controller only routes/validates/authorizes and maps the service result (api-coding-standards.md).
// Access violations return 403, never 404 (api-error-handling.md).

using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Ai.Config;

[ApiController]
[Route("api/v1/workspaces/{workspaceId:guid}/ai")]
public sealed class AiConfigController : ControllerBase
{
    private readonly IAiConfigService _config;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public AiConfigController(IAiConfigService config, IAccessGuard accessGuard, ICurrentUser currentUser)
    {
        _config = config;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>Read the workspace AI-assist config. Any member — the SPA uses <c>enabled</c> to show/hide Ask.</summary>
    [HttpGet("config")]
    [ProducesResponseType(typeof(AiConfigDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Get(
        [FromRoute] Guid workspaceId, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        return Ok(await _config.GetAsync(workspaceId, cancellationToken));
    }

    /// <summary>Update the workspace AI-assist config. Workspace admin only.</summary>
    [HttpPut("config")]
    [ProducesResponseType(typeof(AiConfigDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Update(
        [FromRoute] Guid workspaceId,
        [FromBody] AiConfigUpdateRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        if (!AiContentAllowlist.IsValid(request.ContentFieldAllowlist))
        {
            return AllowlistInvalid();
        }

        var updated = await _config.SetAsync(
            workspaceId, _currentUser.UserId, request.Enabled, request.ContentFieldAllowlist, cancellationToken);
        return Ok(updated);
    }

    private ObjectResult AccessDenied() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/access-denied",
            Title = "Access denied.",
            Status = StatusCodes.Status403Forbidden,
            Detail = "You do not have permission to manage AI settings in this workspace.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult AllowlistInvalid() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/validation",
            Title = "The AI content-field allowlist is not valid.",
            Status = StatusCodes.Status400BadRequest,
            Detail = "The allowlist must be non-empty and may contain only: Name, Description, Workflow Details.",
        })
        {
            StatusCode = StatusCodes.Status400BadRequest,
            ContentTypes = { "application/problem+json" },
        };
}

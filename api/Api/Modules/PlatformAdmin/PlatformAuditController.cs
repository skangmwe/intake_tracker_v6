// Firm-wide audit endpoint (S39 — api-contracts §19, BS §12/§4.3). Platform-admin only (403 never
// 404); invisible to workspace admins. POST with a JSON body (not a GET query string) per
// api/CLAUDE.md — the filter set is multi-field, matching every peer /query endpoint. The controller
// authorizes, enforces the pagination ceiling, and returns the service page.

using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.PlatformAdmin;

[ApiController]
[Route("api/v1/platform/audit")]
public sealed class PlatformAuditController : ControllerBase
{
    /// <summary>Pagination ceiling (api/CLAUDE.md — requests above 100 are rejected, never clamped).</summary>
    private const int MaxPageSize = 100;

    private readonly IFirmWideAuditService _audit;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public PlatformAuditController(IFirmWideAuditService audit, IAccessGuard accessGuard, ICurrentUser currentUser)
    {
        _audit = audit;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>The firm-wide audit log — every workspace, newest first, filtered.</summary>
    [HttpPost("query")]
    [ProducesResponseType(typeof(PaginatedResponse<FirmWideAuditRowResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> QueryFirmWideAudit(
        [FromBody] FirmWideAuditQueryRequest request, CancellationToken cancellationToken)
    {
        if (request.PageSize > MaxPageSize)
        {
            return PlatformProblems.Validation($"Page size can't exceed {MaxPageSize}.");
        }

        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return PlatformProblems.AccessDenied("Only a Platform admin can read the firm-wide audit log.");
        }

        var page = await _audit.QueryAsync(request, cancellationToken);
        return Ok(page);
    }
}

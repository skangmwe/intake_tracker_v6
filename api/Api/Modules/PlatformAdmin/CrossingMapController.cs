// Crossing-map endpoint (S35 — api-contracts §19). Read-only in R1 Phase 1 (BS §6.2). Platform-admin
// only: a non-admin gets 403, never 404. The controller only authorizes and returns the service
// result (api-coding-standards.md — no business logic).

using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.PlatformAdmin;

[ApiController]
[Route("api/v1/platform/crossing-map")]
public sealed class CrossingMapController : ControllerBase
{
    private readonly ICrossingMapService _crossingMap;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public CrossingMapController(ICrossingMapService crossingMap, IAccessGuard accessGuard, ICurrentUser currentUser)
    {
        _crossingMap = crossingMap;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>The seeded PG→AI crossing map (read-only in Phase 1).</summary>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<CrossingMapRowResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetCrossingMap(CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return PlatformProblems.AccessDenied("Only a Platform admin can read the crossing map.");
        }

        var rows = await _crossingMap.GetAsync(cancellationToken);
        return Ok(rows);
    }
}

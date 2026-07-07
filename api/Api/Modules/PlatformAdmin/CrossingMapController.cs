// Crossing-map endpoints (S35 — api-contracts §19, BS §6.2). Platform-admin only: a non-admin gets 403,
// never 404. The read UNIONs the seeded 1:1 pairs with durable admin-authored mappings; propose creates
// a Proposed mapping and confirm makes it live. Both propose and confirm are Platform-admin-gated — S35
// lives in the Platform-admin-only nav band, so the "AI-side confirmation authority" is a Platform admin;
// the two-step (propose → confirm) is the deliberate second action that keeps a mapping inert until
// confirmed. The controller only authorizes and maps outcomes (api-coding-standards.md — no business logic).

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

    /// <summary>The crossing map — seeded 1:1 pairs plus durable proposed/confirmed mappings.</summary>
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

    /// <summary>Mappable fields for the propose form (PG side + AI side).</summary>
    [HttpGet("candidates")]
    [ProducesResponseType(typeof(CrossingCandidatesResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetCandidates(CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return PlatformProblems.AccessDenied("Only a Platform admin can read crossing-map candidates.");
        }

        var candidates = await _crossingMap.GetCandidatesAsync(cancellationToken);
        return Ok(candidates);
    }

    /// <summary>Propose a PG→AI crossing mapping (Platform admin). Creates a Proposed mapping.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(CrossingMapRowResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Propose(
        [FromBody] CrossingMapProposeRequest request, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return PlatformProblems.AccessDenied("Only a Platform admin can propose a crossing mapping.");
        }

        var result = await _crossingMap.ProposeAsync(request, _currentUser.UserId, cancellationToken);
        return result.Outcome == CrossingMapWriteOutcome.Success
            ? Created($"/api/v1/platform/crossing-map/{result.Row!.CrossingMapId}", result.Row)
            : MapFailure(result.Outcome);
    }

    /// <summary>Confirm a proposed mapping (Platform admin) — makes it live for future escalations.</summary>
    [HttpPatch("{crossingMapId:guid}")]
    [ProducesResponseType(typeof(CrossingMapRowResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Confirm(Guid crossingMapId, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return PlatformProblems.AccessDenied("Only a Platform admin can confirm a crossing mapping.");
        }

        var result = await _crossingMap.ConfirmAsync(crossingMapId, _currentUser.UserId, cancellationToken);
        return result.Outcome == CrossingMapWriteOutcome.Success ? Ok(result.Row) : MapFailure(result.Outcome);
    }

    private IActionResult MapFailure(CrossingMapWriteOutcome outcome) => outcome switch
    {
        CrossingMapWriteOutcome.FieldNotFound => PlatformProblems.Validation("A field in the mapping was not found or is retired."),
        CrossingMapWriteOutcome.Unmappable => PlatformProblems.Validation("Derived and platform-defined fields cannot be mapped."),
        CrossingMapWriteOutcome.TypeMismatch => PlatformProblems.Validation("The fields must be the same type to map."),
        CrossingMapWriteOutcome.WrongDirection => PlatformProblems.Validation("A mapping goes from a PG/Dept field to an AI Solutions field."),
        CrossingMapWriteOutcome.BadOptionMap => PlatformProblems.Validation("An option in the correspondence map is not valid."),
        CrossingMapWriteOutcome.AlreadyMapped => PlatformProblems.Conflict("One of these fields is already mapped."),
        CrossingMapWriteOutcome.NotProposable => PlatformProblems.Conflict("That mapping is not awaiting confirmation."),
        CrossingMapWriteOutcome.FieldRetired => PlatformProblems.Conflict("A field in this mapping has been retired."),
        _ => PlatformProblems.Validation("The request is not valid."),
    };
}

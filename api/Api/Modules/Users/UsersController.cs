// Identity endpoints for the SPA (api-contracts.md §1). Both require an authenticated caller
// (the fallback authorization policy enforces this — see AuthenticationSetup). The controller
// only routes/validates/returns; profile assembly and persistence live in the service
// (api-coding-standards.md — no business logic in controllers).

using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Users;

[ApiController]
[Route("api/v1/users")]
public sealed class UsersController : ControllerBase
{
    private readonly IUserProfileService _profiles;
    private readonly ICurrentUser _currentUser;

    public UsersController(IUserProfileService profiles, ICurrentUser currentUser)
    {
        _profiles = profiles;
        _currentUser = currentUser;
    }

    /// <summary>The caller's identity plus every workspace membership.</summary>
    [HttpGet("me")]
    [ProducesResponseType(typeof(MeDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetMe(CancellationToken cancellationToken)
    {
        var me = await _profiles.GetMeAsync(_currentUser.UserId, cancellationToken);
        return me is null ? ProfileNotFound() : Ok(me);
    }

    /// <summary>Persist the caller's theme preference.</summary>
    [HttpPost("me/theme")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> UpdateTheme(
        [FromBody] ThemeUpdateRequest request,
        CancellationToken cancellationToken)
    {
        // [ApiController] runs model validation before this body — invalid theme → 400 ValidationProblem.
        var updated = await _profiles.UpdateThemeAsync(_currentUser.UserId, request.Theme!, cancellationToken);
        return updated ? NoContent() : ProfileNotFound();
    }

    // RFC 7807 shape without needing the DI ProblemDetailsFactory (keeps the action unit-testable).
    private static ObjectResult ProfileNotFound() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/not-found",
            Title = "Profile not available.",
            Status = StatusCodes.Status404NotFound,
            Detail = "Your user profile has not finished provisioning. Try again in a moment.",
        })
        {
            StatusCode = StatusCodes.Status404NotFound,
            ContentTypes = { "application/problem+json" },
        };
}

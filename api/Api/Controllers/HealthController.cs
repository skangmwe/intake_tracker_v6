// GET /health — anonymous, no dependencies, no database calls.
// Per api/CLAUDE.md: "The endpoint must have no dependencies and no database
// calls — it must always respond, even if downstream services are degraded."
//
// The scaffold's health check is the single behaviour that ships. It proves
// the ASP.NET Core pipeline boots and the middleware chain routes correctly.
// Slice 1 (Foundation) adds a separate /readiness endpoint for deeper checks
// that DO hit the database — kept distinct from /health per the "always respond"
// rule.

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Controllers;

[ApiController]
[Route("health")]
[AllowAnonymous] // The only anonymous endpoint — everything else requires auth (api-auth.md).
public sealed class HealthController : ControllerBase
{
    /// <summary>
    /// Health probe. Returns 200 with a short status body when the app is running.
    /// Never returns non-200 — infrastructure liveness relies on this.
    /// </summary>
    [HttpGet]
    public IActionResult Get()
    {
        return Ok(new
        {
            status = "ok",
            service = "ai-solutions-tracker-api",
            version = typeof(HealthController).Assembly
                .GetName().Version?.ToString() ?? "0.0.0"
        });
    }
}

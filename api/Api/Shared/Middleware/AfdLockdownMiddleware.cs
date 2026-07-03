// AFD lockdown — validates the X-Azure-FDID header against the configured
// Front Door ID. Per api-auth.md: Container Apps ipSecurityRestrictions do NOT
// accept the AzureFrontDoor.Backend service tag, so ingress restriction must
// be enforced in-process here. Reject with 403 on mismatch (never 401 — a
// 401 would prompt the SPA to refresh the token, which is not the failure).
//
// No-op when Security:FrontDoor:FrontDoorId is unset, so local dev + dev-tenant
// deploys that don't front the API with AFD keep working.

namespace McDermott.AiTracker.Api.Shared.Middleware;

public sealed class AfdLockdownMiddleware
{
    public const string HeaderName = "X-Azure-FDID";

    private readonly RequestDelegate _next;
    private readonly string? _configuredFrontDoorId;

    public AfdLockdownMiddleware(RequestDelegate next, IConfiguration configuration)
    {
        _next = next;
        _configuredFrontDoorId = configuration["Security:FrontDoor:FrontDoorId"];
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Bypass anonymous health probes so infrastructure liveness never trips this.
        if (string.Equals(context.Request.Path.Value, "/health", StringComparison.OrdinalIgnoreCase))
        {
            await _next(context);
            return;
        }

        if (string.IsNullOrWhiteSpace(_configuredFrontDoorId))
        {
            await _next(context);
            return;
        }

        var incoming = context.Request.Headers[HeaderName].ToString();
        if (!string.Equals(incoming, _configuredFrontDoorId, StringComparison.OrdinalIgnoreCase))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }

        await _next(context);
    }
}

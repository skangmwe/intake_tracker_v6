// Cache-Control defaults — sets Cache-Control: private, no-store on every
// authenticated response by default. Prevents Azure Front Door from serving
// one user's data to another (api-coding-standards.md — Response Caching).
//
// Endpoints for genuinely public reference data opt out by writing their own
// Cache-Control header before this middleware runs (they can invert the check
// by inspecting whether the header is already set).

namespace McDermott.AiTracker.Api.Shared.Middleware;

public sealed class CacheControlMiddleware
{
    private readonly RequestDelegate _next;

    public CacheControlMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(() =>
        {
            if (!context.Response.Headers.ContainsKey("Cache-Control"))
            {
                context.Response.Headers["Cache-Control"] = "private, no-store";
            }
            return Task.CompletedTask;
        });

        await _next(context);
    }
}

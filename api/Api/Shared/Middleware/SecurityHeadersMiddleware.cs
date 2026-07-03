// Security headers — set baseline security headers on every response.
// Per api-performance.md (Security Headers): API responses default to a strict CSP;
// /swagger/* paths get a relaxed CSP for Swashbuckle's inline-script requirement.

namespace McDermott.AiTracker.Api.Shared.Middleware;

public sealed class SecurityHeadersMiddleware
{
    private const string StrictCsp = "default-src 'none'; frame-ancestors 'none'";

    private const string SwaggerCsp =
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; " +
        "font-src 'self' data:; " +
        "connect-src 'self'; " +
        "frame-ancestors 'none'";

    private readonly RequestDelegate _next;

    public SecurityHeadersMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(() =>
        {
            var headers = context.Response.Headers;
            var isSwagger = context.Request.Path.StartsWithSegments("/swagger");

            headers["Content-Security-Policy"] = isSwagger ? SwaggerCsp : StrictCsp;
            headers["X-Content-Type-Options"] = "nosniff";
            headers["Referrer-Policy"] = "no-referrer";
            // HSTS is set only on HTTPS-fronted deployments; wired at deploy time.
            return Task.CompletedTask;
        });

        await _next(context);
    }
}

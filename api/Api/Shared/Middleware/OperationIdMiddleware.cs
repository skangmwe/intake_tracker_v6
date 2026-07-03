// OperationId middleware — the first pipeline item (per api-logging.md).
// Reads or generates the X-Operation-Id header, pushes it to Serilog LogContext so every
// downstream log entry carries the correlation id, and echoes it on the response so
// downstream services can carry the same correlation identifier.

using Serilog.Context;

namespace McDermott.AiTracker.Api.Shared.Middleware;

public sealed class OperationIdMiddleware
{
    public const string HeaderName = "X-Operation-Id";

    private readonly RequestDelegate _next;

    public OperationIdMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        // An incoming value is preserved verbatim so a single correlation id spans
        // API → Worker → downstream services (api-logging.md); otherwise mint one.
        var incoming = context.Request.Headers[HeaderName].ToString();
        var operationId = string.IsNullOrWhiteSpace(incoming) ? Guid.NewGuid().ToString() : incoming;
        context.Response.Headers[HeaderName] = operationId;
        context.Items[HeaderName] = operationId;

        // OperationId is one of the two required structured log properties (api-logging.md);
        // pushing it here — before authentication — means auth-failure entries are correlated too.
        using (LogContext.PushProperty("OperationId", operationId))
        {
            await _next(context);
        }
    }
}

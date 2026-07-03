// The single global exception handler (api-error-handling.md — one handler via
// UseExceptionHandler; no per-controller try/catch for unhandled exceptions).
//
// Every unhandled exception becomes a 500 application/problem+json response with a generic
// detail and the request's OperationId. The original exception message and stack trace are
// NEVER exposed to the client — they are logged at Error with the OperationId (the framework
// developer exception page is not used; this handler replaces it in every environment so a
// stray ASPNETCORE_ENVIRONMENT=Development never leaks internals).

using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Shared.Errors;

public sealed class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler> _logger;

    public GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger) => _logger = logger;

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var operationId = httpContext.Items.TryGetValue(OperationIdMiddleware.HeaderName, out var value)
            ? value?.ToString()
            : null;

        // Full detail to the log (with OperationId correlation); never to the client.
        _logger.LogError(exception, "Unhandled exception. OperationId={OperationId}", operationId);

        var problem = new ProblemDetails
        {
            Type = "https://mws.ai/errors/internal",
            Title = "An unexpected error occurred.",
            Status = StatusCodes.Status500InternalServerError,
            Detail = "Something went wrong on our end. Try again in a moment.",
            Instance = httpContext.Request.Path,
        };

        if (!string.IsNullOrEmpty(operationId))
        {
            problem.Extensions["operationId"] = operationId;
        }

        httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await httpContext.Response.WriteAsJsonAsync(
            problem,
            options: null,
            contentType: "application/problem+json",
            cancellationToken);

        return true;
    }
}

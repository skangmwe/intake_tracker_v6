// Shared ProblemDetails builders for the platform-admin controllers (Slice 19). RFC 7807
// application/problem+json with plain-language detail, no stack traces (api-error-handling.md). Kept
// in one place so the four S35–S39 controllers map outcomes consistently; the firm error codes match
// api-contracts §20.

using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.PlatformAdmin;

internal static class PlatformProblems
{
    public static ObjectResult AccessDenied(string detail) =>
        Build(StatusCodes.Status403Forbidden, "access-denied", "Access denied.", detail);

    public static ObjectResult Validation(string detail) =>
        Build(StatusCodes.Status400BadRequest, "validation", "The request is not valid.", detail);

    public static ObjectResult Conflict(string detail) =>
        Build(StatusCodes.Status409Conflict, "conflict", "The request conflicts with the current state.", detail);

    public static ObjectResult DuplicatePrefix(string detail) =>
        Build(StatusCodes.Status409Conflict, "duplicate-prefix", "That prefix is already in use.", detail);

    public static ObjectResult NotFound(string detail) =>
        Build(StatusCodes.Status404NotFound, "not-found", "Not found.", detail);

    private static ObjectResult Build(int status, string code, string title, string detail) =>
        new(new ProblemDetails
        {
            Type = $"https://mws.ai/errors/{code}",
            Title = title,
            Status = status,
            Detail = detail,
        })
        {
            StatusCode = status,
            ContentTypes = { "application/problem+json" },
        };
}

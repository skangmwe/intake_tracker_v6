// Workspace audit-log endpoint (Slice 18 — api-contracts.md §18, S33). The whole surface is
// WorkspaceAdmin-only (the blueprint's audience; the log exposes actor PII + record activity across
// the workspace). The controller only routes / validates / authorizes and maps the result
// (api-coding-standards.md — no business logic). Access violations return 403, never 404
// (api-error-handling.md). It is a POST with a JSON body (not a GET query string) per api/CLAUDE.md —
// the filter set is multi-field, matching every peer /query endpoint (requests, notifications, search).

using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Audit;

[ApiController]
[Route("api/v1")]
public sealed class AuditController : ControllerBase
{
    /// <summary>Pagination ceiling (api/CLAUDE.md — requests above 100 are rejected, never clamped).</summary>
    private const int MaxPageSize = 100;

    private readonly IAuditService _audit;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public AuditController(IAuditService audit, IAccessGuard accessGuard, ICurrentUser currentUser)
    {
        _audit = audit;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>The workspace's audit log — newest first, filtered by date / actor / record / event type.</summary>
    [HttpPost("workspaces/{workspaceId:guid}/audit/query")]
    [ProducesResponseType(typeof(PaginatedResponse<AuditLogRowResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> QueryWorkspaceAudit(
        [FromRoute] Guid workspaceId,
        [FromBody] AuditLogQueryRequest request,
        CancellationToken cancellationToken)
    {
        if (request.PageSize > MaxPageSize)
        {
            return ValidationFailure(new Dictionary<string, string[]>
            {
                ["pageSize"] = new[] { $"Page size can't exceed {MaxPageSize}." },
            });
        }

        if (!await _accessGuard.HasWorkspaceLevelAsync(
                _currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        var page = await _audit.QueryWorkspaceAuditAsync(workspaceId, request, cancellationToken);
        return Ok(page);
    }

    private ObjectResult ValidationFailure(IReadOnlyDictionary<string, string[]> errors) =>
        new(new ValidationProblemDetails(errors.ToDictionary(entry => entry.Key, entry => entry.Value))
        {
            Type = "https://mws.ai/errors/validation",
            Title = "The request is not valid.",
            Status = StatusCodes.Status400BadRequest,
            Detail = "One or more fields need attention.",
        })
        {
            StatusCode = StatusCodes.Status400BadRequest,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult AccessDenied() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/access-denied",
            Title = "Access denied.",
            Status = StatusCodes.Status403Forbidden,
            Detail = "You do not have permission to read the audit log for this workspace.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };
}

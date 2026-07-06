// Workspace provisioning endpoint (S38 — api-contracts §2, BS §1.1). Platform-admin only (403 never
// 404). Phase 1: this endpoint is called by ops tooling; the in-app wizard (S38 UI) lands in slice 24.
// The controller authorizes, validates the body (Data Annotations), and maps the service outcome
// (api-coding-standards.md — no business logic). A prefix collision is 409 duplicate-prefix
// (api-contracts §20); a missing template is 503 (infra state, not caller input).

using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Workspaces;

[ApiController]
[Route("api/v1/workspaces")]
public sealed class WorkspacesController : ControllerBase
{
    private readonly IWorkspaceProvisioningService _provisioning;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public WorkspacesController(
        IWorkspaceProvisioningService provisioning, IAccessGuard accessGuard, ICurrentUser currentUser)
    {
        _provisioning = provisioning;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>Provision a new PG/Dept workspace by cloning the template (Platform admin only).</summary>
    [HttpPost]
    [ProducesResponseType(typeof(WorkspaceProvisionResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> ProvisionWorkspace(
        [FromBody] WorkspaceProvisionRequest request, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _provisioning.ProvisionAsync(request, _currentUser.UserId, OperationId(), cancellationToken);
        return result.Outcome switch
        {
            ProvisionOutcome.Success => Created($"/api/v1/workspaces/{result.Workspace!.Id}", result.Workspace),
            ProvisionOutcome.DuplicatePrefix => DuplicatePrefix(),
            ProvisionOutcome.UnknownAdmin => Validation("The initial admin must be an active user."),
            ProvisionOutcome.TemplateMissing => TemplateUnavailable(),
            _ => Validation("A workspace name and prefix are required."),
        };
    }

    private string OperationId() =>
        HttpContext.Items.TryGetValue(OperationIdMiddleware.HeaderName, out var value) && value is string operationId
            ? operationId
            : string.Empty;

    private ObjectResult AccessDenied() =>
        Problem(StatusCodes.Status403Forbidden, "access-denied", "Access denied.",
            "Only a Platform admin can provision workspaces.");

    private ObjectResult Validation(string detail) =>
        Problem(StatusCodes.Status400BadRequest, "validation", "The request is not valid.", detail);

    private ObjectResult DuplicatePrefix() =>
        Problem(StatusCodes.Status409Conflict, "duplicate-prefix", "Prefix already in use.",
            "That prefix is already in use by another workspace.");

    private ObjectResult TemplateUnavailable() =>
        Problem(StatusCodes.Status503ServiceUnavailable, "template-unavailable", "Template unavailable.",
            "The PG/Dept template workspace is not provisioned. Contact IT.");

    private static ObjectResult Problem(int status, string code, string title, string detail) =>
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

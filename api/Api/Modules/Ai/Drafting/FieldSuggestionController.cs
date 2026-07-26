// Field-value suggestions (Phase 4, §14 drafting). A single non-streaming call that proposes one field's value
// from the record's own allowlisted context. The controller enforces the two guardrails that live at the boundary:
// off-switch (workspace AiAssistEnabled → 403 when off, with no provider call) and the data floor (it projects the
// client-supplied context to the workspace content-field allowlist server-side — the client is never trusted to
// pre-filter). Grounding, invention guards, and the provider call live in FieldSuggestionService.

using McDermott.AiTracker.Api.Modules.Ai.Config;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Ai.Drafting;

[ApiController]
[Route("api/v1/workspaces/{workspaceId:guid}/ai")]
public sealed class FieldSuggestionController : ControllerBase
{
    private readonly IFieldSuggestionService _suggestions;
    private readonly IAiConfigService _config;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public FieldSuggestionController(
        IFieldSuggestionService suggestions, IAiConfigService config, IAccessGuard accessGuard, ICurrentUser currentUser)
    {
        _suggestions = suggestions;
        _config = config;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>Suggest a value for one field from the record's allowlisted context. Any member; disabled → 403.</summary>
    [HttpPost("field-suggestion")]
    [ProducesResponseType(typeof(FieldSuggestion), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Suggest(
        [FromRoute] Guid workspaceId,
        [FromBody] FieldSuggestionRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        // Off-switch: a disabled workspace never reaches a provider.
        var config = await _config.GetAsync(workspaceId, cancellationToken);
        if (!config.Enabled)
        {
            return AiDisabled();
        }

        if (string.IsNullOrWhiteSpace(request.TargetFieldKey))
        {
            return TargetFieldRequired();
        }

        // Data floor: keep only the fields the workspace allowlist permits — enforced here, never trusted to the
        // client. The allowlist holds canonical names (Name / Description / WorkflowDetails); the client sends
        // camelCase field keys, so match case-insensitively and store under the canonical name.
        var allowlist = config.ContentFieldAllowlist;
        var context = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var entry in request.Fields ?? new Dictionary<string, string>())
        {
            var canonical = allowlist.FirstOrDefault(
                allowed => string.Equals(allowed, entry.Key, StringComparison.OrdinalIgnoreCase));
            if (canonical is not null)
            {
                context[canonical] = entry.Value;
            }
        }

        var suggestion = await _suggestions.SuggestAsync(
            workspaceId, _currentUser.UserId, request.ObjectType ?? string.Empty, request.TargetFieldKey,
            context, request.SelectOptions, request.Provider, cancellationToken);

        Response.Headers.CacheControl = "private, no-store";
        return Ok(suggestion);
    }

    private ObjectResult AccessDenied() =>
        Problem("https://mws.ai/errors/access-denied", "Access denied.",
            "You do not have access to AI assist in this workspace.", StatusCodes.Status403Forbidden);

    private ObjectResult AiDisabled() =>
        Problem("https://mws.ai/errors/access-denied", "AI assist is turned off.",
            "AI assist is turned off for this workspace. Ask a workspace admin to enable it.", StatusCodes.Status403Forbidden);

    private ObjectResult TargetFieldRequired() =>
        Problem("https://mws.ai/errors/validation", "A target field is required.",
            "Specify the field to suggest a value for.", StatusCodes.Status400BadRequest);

    private static ObjectResult Problem(string type, string title, string detail, int status) =>
        new(new ProblemDetails { Type = type, Title = title, Status = status, Detail = detail })
        {
            StatusCode = status,
            ContentTypes = { "application/problem+json" },
        };
}

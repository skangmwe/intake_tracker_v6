// Platform broadcast endpoints (platform-admin only). A platform admin posts an announcement to every
// workspace ('all') or a specific set; the service fans out one normal per-workspace announcement per
// target, tied by one BroadcastId, reusing the per-workspace bell fan-out. Routes mirror the workspace
// announcements controller but are grouped by broadcast. The controller only routes / validates /
// authorizes and maps the service result to a status code (api-coding-standards.md — no business logic).
// Every action is gated on the caller's Platform-admin grant; a non-admin gets 403, never 404 (BS §22.6).

using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Announcements;

[ApiController]
[Route("api/v1/platform")]
public sealed class PlatformAnnouncementsController : ControllerBase
{
    private static readonly string[] TargetKinds = { "all", "specific" };

    private readonly IAnnouncementsService _announcements;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public PlatformAnnouncementsController(
        IAnnouncementsService announcements, IAccessGuard accessGuard, ICurrentUser currentUser)
    {
        _announcements = announcements;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>The workspaces a platform admin may broadcast to (excludes the PG/Dept clone template).</summary>
    [HttpGet("workspaces")]
    [ProducesResponseType(typeof(IReadOnlyList<PlatformWorkspaceDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> ListWorkspaces(CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return AccessDenied();
        }

        var workspaces = await _announcements.ListPlatformWorkspacesAsync(cancellationToken);
        return Ok(workspaces);
    }

    /// <summary>Post a broadcast to all or specific workspaces — fans out one per-workspace copy per target.</summary>
    [HttpPost("announcements")]
    [ProducesResponseType(typeof(PlatformAnnouncementCreatedDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Create(
        [FromBody] PlatformAnnouncementCreateRequest request, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return AccessDenied();
        }

        var writeError = ValidateWriteStatus(request.Status, request.ScheduledPublishAt);
        if (writeError is not null)
        {
            return writeError;
        }

        var (targetIds, targetError) = await ResolveTargetsAsync(request.Target, cancellationToken);
        if (targetError is not null)
        {
            return targetError;
        }

        var created = await _announcements.CreatePlatformBroadcastAsync(
            request, targetIds!, _currentUser.UserId, OperationId(), cancellationToken);
        return Created($"/api/v1/platform/announcements/{created.BroadcastId}", created);
    }

    /// <summary>The platform manage list — every broadcast grouped to one row.</summary>
    [HttpPost("announcements/query")]
    [ProducesResponseType(typeof(PaginatedResponse<PlatformAnnouncementRow>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Query([FromBody] AnnouncementQuery query, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return AccessDenied();
        }

        var request = query ?? new AnnouncementQuery();
        var result = await _announcements.QueryPlatformAsync(request.Page, request.PageSize, cancellationToken);
        return Ok(result);
    }

    /// <summary>Edit a broadcast's content across every copy (targets are fixed at creation).</summary>
    [HttpPatch("announcements/{broadcastId:guid}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Update(
        [FromRoute] Guid broadcastId,
        [FromBody] PlatformAnnouncementPatchRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return AccessDenied();
        }

        var writeError = ValidateWriteStatus(request.Status, request.ScheduledPublishAt);
        if (writeError is not null)
        {
            return writeError;
        }

        var result = await _announcements.UpdateBroadcastAsync(
            broadcastId, request, _currentUser.UserId, OperationId(), cancellationToken);
        return MapMutation(result, "This broadcast can no longer be edited.");
    }

    /// <summary>Retire (archive) every copy of a broadcast — never a hard delete.</summary>
    [HttpPost("announcements/{broadcastId:guid}/retire")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Retire([FromRoute] Guid broadcastId, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _announcements.RetireBroadcastAsync(broadcastId, _currentUser.UserId, cancellationToken);
        return MapMutation(result, "This broadcast is no longer available.");
    }

    /// <summary>Resolve the target workspace set. 'all' → every non-template workspace; 'specific' → the
    /// supplied ids, each validated against the known non-template set. Returns a 400 result on error.</summary>
    private async Task<(IReadOnlyList<Guid>? Ids, IActionResult? Error)> ResolveTargetsAsync(
        PlatformAnnouncementTarget target, CancellationToken cancellationToken)
    {
        if (target is null || string.IsNullOrWhiteSpace(target.Kind) || Array.IndexOf(TargetKinds, target.Kind) < 0)
        {
            return (null, TargetProblem("Choose where to post: all workspaces or specific ones."));
        }

        var workspaces = await _announcements.ListPlatformWorkspacesAsync(cancellationToken);
        var knownIds = workspaces.Select(workspace => workspace.Id).ToHashSet();

        if (string.Equals(target.Kind, "all", StringComparison.Ordinal))
        {
            if (knownIds.Count == 0)
            {
                return (null, TargetProblem("There are no workspaces to post to."));
            }

            return (knownIds.ToList(), null);
        }

        // 'specific'
        if (target.WorkspaceIds is null || target.WorkspaceIds.Count == 0)
        {
            return (null, TargetProblem("Select at least one workspace to post to."));
        }

        if (target.WorkspaceIds.Any(id => !knownIds.Contains(id)))
        {
            return (null, TargetProblem("One or more selected workspaces are not available."));
        }

        return (target.WorkspaceIds.Distinct().ToList(), null);
    }

    private IActionResult MapMutation(AnnouncementMutationResult result, string invalidStateDetail) =>
        result.Outcome switch
        {
            AnnouncementMutationOutcome.Success => Ok(),
            AnnouncementMutationOutcome.InvalidState => ConflictProblem(invalidStateDetail),
            _ => AccessDenied(),
        };

    /// <summary>Validate the reconciled write status: 'Active' | 'Scheduled' (empty → 'Active'), and that a
    /// Scheduled post carries a future publish time.</summary>
    private BadRequestObjectResult? ValidateWriteStatus(string? status, DateTime? scheduledPublishAt)
    {
        var normalized = string.IsNullOrWhiteSpace(status) ? "Active" : status;
        var isActive = string.Equals(normalized, "Active", StringComparison.OrdinalIgnoreCase);
        var isScheduled = string.Equals(normalized, "Scheduled", StringComparison.OrdinalIgnoreCase);

        if (!isActive && !isScheduled)
        {
            return ValidationProblem("status", "Choose a status: Active or Scheduled.");
        }

        if (isScheduled && scheduledPublishAt is null)
        {
            return ValidationProblem("scheduledPublishAt", "Pick a date and time to publish a scheduled announcement.");
        }

        if (isScheduled && scheduledPublishAt is not null && scheduledPublishAt.Value <= DateTime.UtcNow)
        {
            return ValidationProblem("scheduledPublishAt", "Choose a publish time in the future.");
        }

        return null;
    }

    private BadRequestObjectResult TargetProblem(string message) => ValidationProblem("target", message);

    private BadRequestObjectResult ValidationProblem(string field, string message)
    {
        ModelState.AddModelError(field, message);
        return new BadRequestObjectResult(new ValidationProblemDetails(ModelState)
        {
            Type = "https://mws.ai/errors/validation",
            Title = "The broadcast is not valid.",
            Status = StatusCodes.Status400BadRequest,
        })
        {
            ContentTypes = { "application/problem+json" },
        };
    }

    private string OperationId() =>
        HttpContext.Items.TryGetValue(OperationIdMiddleware.HeaderName, out var value) && value is string operationId
            ? operationId
            : string.Empty;

    private ObjectResult ConflictProblem(string detail) =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/conflict",
            Title = "The broadcast is in a state that does not allow this action.",
            Status = StatusCodes.Status409Conflict,
            Detail = detail,
        })
        {
            StatusCode = StatusCodes.Status409Conflict,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult AccessDenied() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/access-denied",
            Title = "Access denied.",
            Status = StatusCodes.Status403Forbidden,
            Detail = "You do not have access to platform announcements.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };
}

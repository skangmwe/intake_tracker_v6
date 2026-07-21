// Announcements endpoints (Slice 13 — api-contracts.md §12). Two audiences of routes:
//   • Consumer (any member): POST /announcements/query (audience-scoped history), GET /announcements/{id}.
//   • Admin (WorkspaceAdmin, workspace-scoped path like Lifecycle §18): POST /workspaces/{id}/announcements
//     (create Draft) and POST /workspaces/{id}/announcements/query (manage list). Item mutations
//     (PATCH / publish / retire by id) are author-or-admin, resolved in the service from the row.
// The controller only routes / validates / authorizes and maps the service result to a status code
// (api-coding-standards.md — no business logic). Access violations return 403, never 404 (BS §22.6).

using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.Announcements;

[ApiController]
[Route("api/v1")]
public sealed class AnnouncementsController : ControllerBase
{
    private static readonly string[] AudienceKinds = { "everyone", "role-scoped", "named-users" };

    private readonly IAnnouncementsService _announcements;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public AnnouncementsController(
        IAnnouncementsService announcements, IAccessGuard accessGuard, ICurrentUser currentUser)
    {
        _announcements = announcements;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>The caller's Published, in-audience announcement history (S22).</summary>
    [HttpPost("announcements/query")]
    [ProducesResponseType(typeof(PaginatedResponse<AnnouncementListRow>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Query([FromBody] AnnouncementQuery query, CancellationToken cancellationToken)
    {
        var request = query ?? new AnnouncementQuery();
        var result = await _announcements.QueryAsync(_currentUser.UserId, request.Page, request.PageSize, cancellationToken);
        return Ok(result);
    }

    /// <summary>Read one announcement (S21). 403 when the caller cannot see it.</summary>
    [HttpGet("announcements/{id:guid}")]
    [ProducesResponseType(typeof(AnnouncementDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetById([FromRoute] Guid id, CancellationToken cancellationToken)
    {
        var announcement = await _announcements.GetByIdAsync(id, _currentUser.UserId, cancellationToken);
        return announcement is null ? AccessDenied() : Ok(announcement);
    }

    /// <summary>Create a Draft announcement in a workspace (WorkspaceAdmin).</summary>
    [HttpPost("workspaces/{workspaceId:guid}/announcements")]
    [ProducesResponseType(typeof(AnnouncementDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Create(
        [FromRoute] Guid workspaceId,
        [FromBody] AnnouncementCreateRequest request,
        CancellationToken cancellationToken)
    {
        var audienceError = ValidateAudience(request.Audience);
        if (audienceError is not null)
        {
            return audienceError;
        }

        var writeError = ValidateWriteStatus(request.Status, request.ScheduledPublishAt);
        if (writeError is not null)
        {
            return writeError;
        }

        if (!await _accessGuard.HasWorkspaceLevelAsync(
                _currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        if (!await IsChosenAuthorMemberAsync(request.Author, workspaceId, cancellationToken))
        {
            return InvalidAuthorProblem();
        }

        var created = await _announcements.CreateAsync(
            workspaceId, request, _currentUser.UserId, OperationId(), cancellationToken);
        return Created($"/api/v1/announcements/{created.Id}", created);
    }

    /// <summary>The workspace's full announcement list across all statuses (WorkspaceAdmin, S23).</summary>
    [HttpPost("workspaces/{workspaceId:guid}/announcements/query")]
    [ProducesResponseType(typeof(PaginatedResponse<AnnouncementListRow>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> QueryForManage(
        [FromRoute] Guid workspaceId,
        [FromBody] AnnouncementQuery query,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(
                _currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        var request = query ?? new AnnouncementQuery();
        var result = await _announcements.QueryForManageAsync(workspaceId, request.Page, request.PageSize, cancellationToken);
        return Ok(result);
    }

    /// <summary>Replace the editable fields (author or WorkspaceAdmin; Retired is immutable).</summary>
    [HttpPatch("announcements/{id:guid}")]
    [ProducesResponseType(typeof(AnnouncementDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Update(
        [FromRoute] Guid id,
        [FromBody] AnnouncementPatchRequest request,
        CancellationToken cancellationToken)
    {
        var audienceError = ValidateAudience(request.Audience);
        if (audienceError is not null)
        {
            return audienceError;
        }

        var writeError = ValidateWriteStatus(request.Status, request.ScheduledPublishAt);
        if (writeError is not null)
        {
            return writeError;
        }

        // The chosen "posted by" is validated against the row's workspace in the service (it holds the
        // row) — a non-member surfaces as InvalidAuthor → 400.
        var result = await _announcements.UpdateAsync(id, request, _currentUser.UserId, OperationId(), cancellationToken);
        return MapMutation(result, "This announcement has been archived and can no longer be edited.");
    }

    /// <summary>Publish a Draft — fans "Announcement posted" to the audience (author or WorkspaceAdmin).</summary>
    [HttpPost("announcements/{id:guid}/publish")]
    [ProducesResponseType(typeof(AnnouncementDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Publish([FromRoute] Guid id, CancellationToken cancellationToken)
    {
        var result = await _announcements.PublishAsync(id, _currentUser.UserId, OperationId(), cancellationToken);
        return MapMutation(result, "A retired announcement cannot be published.");
    }

    /// <summary>Retire an announcement — never a hard delete (author or WorkspaceAdmin).</summary>
    [HttpPost("announcements/{id:guid}/retire")]
    [ProducesResponseType(typeof(AnnouncementDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Retire([FromRoute] Guid id, CancellationToken cancellationToken)
    {
        var result = await _announcements.RetireAsync(id, _currentUser.UserId, cancellationToken);
        return MapMutation(result, "This announcement is no longer available.");
    }

    private IActionResult MapMutation(AnnouncementMutationResult result, string invalidStateDetail) =>
        result.Outcome switch
        {
            AnnouncementMutationOutcome.Success => Ok(result.Announcement),
            AnnouncementMutationOutcome.InvalidState => ConflictProblem(invalidStateDetail),
            AnnouncementMutationOutcome.InvalidAuthor => InvalidAuthorProblem(),
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
            return (BadRequestObjectResult)ValidationProblem(new Dictionary<string, string[]>
            {
                ["status"] = new[] { "Choose a status: Active or Scheduled." },
            });
        }

        if (isScheduled && scheduledPublishAt is null)
        {
            return (BadRequestObjectResult)ValidationProblem(new Dictionary<string, string[]>
            {
                ["scheduledPublishAt"] = new[] { "Pick a date and time to publish a scheduled announcement." },
            });
        }

        if (isScheduled && scheduledPublishAt is not null && scheduledPublishAt.Value <= DateTime.UtcNow)
        {
            return (BadRequestObjectResult)ValidationProblem(new Dictionary<string, string[]>
            {
                ["scheduledPublishAt"] = new[] { "Choose a publish time in the future." },
            });
        }

        return null;
    }

    /// <summary>True when the chosen poster is the acting admin, unset, or a member of the workspace.</summary>
    private async Task<bool> IsChosenAuthorMemberAsync(Guid author, Guid workspaceId, CancellationToken cancellationToken)
    {
        if (author == Guid.Empty || author == _currentUser.UserId)
        {
            return true;
        }

        return await _accessGuard.HasWorkspaceLevelAsync(author, workspaceId, WorkspaceLevel.Viewer, cancellationToken);
    }

    private BadRequestObjectResult InvalidAuthorProblem() =>
        (BadRequestObjectResult)ValidationProblem(new Dictionary<string, string[]>
        {
            ["author"] = new[] { "Choose a poster who is a member of this workspace." },
        });

    private BadRequestObjectResult? ValidateAudience(AnnouncementAudience? audience)
    {
        if (audience is null || string.IsNullOrWhiteSpace(audience.Kind) || Array.IndexOf(AudienceKinds, audience.Kind) < 0)
        {
            return (BadRequestObjectResult)ValidationProblem(new Dictionary<string, string[]>
            {
                ["audience"] = new[] { "Choose an audience: everyone, role-scoped, or named-users." },
            });
        }

        if (string.Equals(audience.Kind, "role-scoped", StringComparison.Ordinal)
            && (audience.RoleLabels is null || audience.RoleLabels.Count == 0))
        {
            return (BadRequestObjectResult)ValidationProblem(new Dictionary<string, string[]>
            {
                ["audience"] = new[] { "Select at least one role for a role-scoped audience." },
            });
        }

        if (string.Equals(audience.Kind, "named-users", StringComparison.Ordinal)
            && (audience.UserIds is null || audience.UserIds.Count == 0))
        {
            return (BadRequestObjectResult)ValidationProblem(new Dictionary<string, string[]>
            {
                ["audience"] = new[] { "Add at least one person for a named-users audience." },
            });
        }

        return null;
    }

    private IActionResult ValidationProblem(IDictionary<string, string[]> errors)
    {
        foreach (var (field, messages) in errors)
        {
            foreach (var message in messages)
            {
                ModelState.AddModelError(field, message);
            }
        }

        return new BadRequestObjectResult(new ValidationProblemDetails(ModelState)
        {
            Type = "https://mws.ai/errors/validation",
            Title = "The announcement is not valid.",
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
            Title = "The announcement is in a state that does not allow this action.",
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
            Detail = "You do not have access to this announcement.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };
}

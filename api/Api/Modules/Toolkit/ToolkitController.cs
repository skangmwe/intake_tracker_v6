// Toolkit endpoints (Slice 29 — v2-reconciliation.md §API deltas Toolkit). The controller routes,
// validates at the boundary, and maps the service outcome to a status code (api-coding-standards.md —
// no business logic). Access is resolved inside the service: a forbidden OR non-existent item both
// come back Denied/null and map to 403 — never 404 — so existence is never disclosed (BS §22.6).
// Create/patch accept multipart/form-data — a JSON `payload` part plus an optional `file` part —
// so an item can be created or edited with a pasted body and/or an uploaded asset in one call.
// Upload validation (extension allowlist, size) runs BEFORE any bytes stream (api-blob-attachments.md).
// File names and free-text values are Confidential — never logged.

using System.Text.Json;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace McDermott.AiTracker.Api.Modules.Toolkit;

[ApiController]
[Route("api/v1")]
public sealed class ToolkitController : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static readonly HashSet<string> AllowedKinds = new(StringComparer.Ordinal) { "Playbook", "Plugin", "Prompt" };
    private static readonly HashSet<string> AllowedStatuses = new(StringComparer.Ordinal) { "Active", "Draft", "Archived" };

    private readonly IToolkitService _toolkit;
    private readonly ICurrentUser _currentUser;
    private readonly ToolkitOptions _options;

    public ToolkitController(IToolkitService toolkit, ICurrentUser currentUser, IOptions<ToolkitOptions> options)
    {
        _toolkit = toolkit;
        _currentUser = currentUser;
        _options = options.Value;
    }

    /// <summary>The S43 Toolkit list — filter/sort/page payload (Viewer+ in the workspace).</summary>
    [HttpPost("workspaces/{workspaceId:guid}/toolkit/query")]
    [ProducesResponseType(typeof(PaginatedResponse<ToolkitItemListRowDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> QueryToolkit(
        [FromRoute] Guid workspaceId, [FromBody] PaginatedQuery query, CancellationToken cancellationToken)
    {
        var page = await _toolkit.QueryAsync(workspaceId, _currentUser.UserId, query, cancellationToken);
        return page is null ? AccessDenied() : Ok(page);
    }

    /// <summary>The full item (S43 detail sheet). Access is baked into the read — no row means 403.</summary>
    [HttpGet("toolkit/{itemId}")]
    [ProducesResponseType(typeof(ToolkitItemDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetItem([FromRoute] string itemId, CancellationToken cancellationToken)
    {
        var item = await _toolkit.GetByIdAsync(itemId, _currentUser.UserId, cancellationToken);
        return item is null ? AccessDenied() : Ok(item);
    }

    /// <summary>Create a Toolkit item — paste-or-upload (Member+ in the workspace).</summary>
    [HttpPost("workspaces/{workspaceId:guid}/toolkit")]
    [ProducesResponseType(typeof(ToolkitItemDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status413RequestEntityTooLarge)]
    [ProducesResponseType(StatusCodes.Status502BadGateway)]
    public async Task<IActionResult> CreateItem(
        [FromRoute] Guid workspaceId, [FromForm] string? payload, IFormFile? file, CancellationToken cancellationToken)
    {
        if (!TryParsePayload<ToolkitItemCreateRequest>(payload, out var request, out var parseError))
        {
            return parseError!;
        }

        if (string.IsNullOrWhiteSpace(request!.Name))
        {
            return ValidationFailure("name", "Enter a name for this item.");
        }

        if (string.IsNullOrWhiteSpace(request.Kind) || !AllowedKinds.Contains(request.Kind))
        {
            return ValidationFailure("kind", "Choose a type: Playbook, Plugin, or Prompt.");
        }

        if (request.Status is not null && !AllowedStatuses.Contains(request.Status))
        {
            return ValidationFailure("status", "Choose a status: Active, Draft, or Archived.");
        }

        if (!TryOpenUpload(file, out var upload, out var uploadError))
        {
            return uploadError!;
        }

        try
        {
            var result = await _toolkit.CreateAsync(
                workspaceId, request, upload, _currentUser.UserId, OperationId(), cancellationToken);
            return MapWrite(result, isCreate: true);
        }
        finally
        {
            upload?.Content.Dispose();
        }
    }

    /// <summary>Partial edit of an item — fields and/or a replaced attachment (Member+).</summary>
    [HttpPatch("toolkit/{itemId}")]
    [ProducesResponseType(typeof(ToolkitItemDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status413RequestEntityTooLarge)]
    [ProducesResponseType(StatusCodes.Status502BadGateway)]
    public async Task<IActionResult> UpdateItem(
        [FromRoute] string itemId, [FromForm] string? payload, IFormFile? file, CancellationToken cancellationToken)
    {
        if (!TryParsePayload<ToolkitItemPatchRequest>(payload, out var request, out var parseError))
        {
            return parseError!;
        }

        if (request!.Kind is not null && !AllowedKinds.Contains(request.Kind))
        {
            return ValidationFailure("kind", "Choose a type: Playbook, Plugin, or Prompt.");
        }

        if (request.Status is not null && !AllowedStatuses.Contains(request.Status))
        {
            return ValidationFailure("status", "Choose a status: Active, Draft, or Archived.");
        }

        if (!TryOpenUpload(file, out var upload, out var uploadError))
        {
            return uploadError!;
        }

        try
        {
            var result = await _toolkit.PatchAsync(
                itemId, request, upload, ResolveIfMatch(request.IfMatch), _currentUser.UserId, OperationId(), cancellationToken);
            return MapWrite(result, isCreate: false);
        }
        finally
        {
            upload?.Content.Dispose();
        }
    }

    /// <summary>Retire (soft-delete) an item (Member+). Idempotent — a second call returns 403.</summary>
    [HttpPost("toolkit/{itemId}/retire")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> RetireItem([FromRoute] string itemId, CancellationToken cancellationToken)
    {
        var retired = await _toolkit.RetireAsync(itemId, _currentUser.UserId, OperationId(), cancellationToken);
        return retired ? NoContent() : AccessDenied();
    }

    /// <summary>Restore a retired item (Member+). Idempotent — a second call returns 403.</summary>
    [HttpPost("toolkit/{itemId}/restore")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> RestoreItem([FromRoute] string itemId, CancellationToken cancellationToken)
    {
        var restored = await _toolkit.RestoreAsync(itemId, _currentUser.UserId, OperationId(), cancellationToken);
        return restored ? NoContent() : AccessDenied();
    }

    /// <summary>Download the item's uploaded file. Streams from Blob (Viewer+ on the workspace).</summary>
    [HttpGet("toolkit/{itemId}/attachment")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DownloadAttachment([FromRoute] string itemId, CancellationToken cancellationToken)
    {
        var result = await _toolkit.GetForDownloadAsync(itemId, _currentUser.UserId, cancellationToken);
        return result.Outcome switch
        {
            ToolkitDownloadOutcome.Denied => AccessDenied(),
            ToolkitDownloadOutcome.NoAttachment => NotFoundProblem(),
            _ => await StreamAttachmentAsync(result.Download!, cancellationToken),
        };
    }

    private async Task<IActionResult> StreamAttachmentAsync(ToolkitDownload download, CancellationToken cancellationToken)
    {
        // Cache-Control: private, no-store is applied to every authenticated response by
        // CacheControlMiddleware — item files must never be edge-cached.
        var stream = await _toolkit.GetContentStreamAsync(download, cancellationToken);
        return File(stream, download.ContentType, download.FileName);
    }

    // ─── Multipart parsing + validation helpers ────────────────────────────────

    private bool TryParsePayload<T>(string? payload, out T? request, out IActionResult? error)
        where T : class
    {
        request = null;
        error = null;
        if (string.IsNullOrWhiteSpace(payload))
        {
            error = ValidationFailure("payload", "The request is missing its details.");
            return false;
        }

        try
        {
            request = JsonSerializer.Deserialize<T>(payload, JsonOptions);
        }
        catch (JsonException)
        {
            error = ValidationFailure("payload", "The request details are not valid.");
            return false;
        }

        if (request is null)
        {
            error = ValidationFailure("payload", "The request details are not valid.");
            return false;
        }

        return true;
    }

    private bool TryOpenUpload(IFormFile? file, out ToolkitUpload? upload, out IActionResult? error)
    {
        upload = null;
        error = null;
        if (file is null || file.Length == 0)
        {
            return true;   // no file is valid — an item may be paste-only or field-only.
        }

        // Sanitize the filename (api-validation.md — strip any path; reject traversal / absolute).
        var fileName = Path.GetFileName(file.FileName ?? string.Empty);
        if (string.IsNullOrWhiteSpace(fileName))
        {
            error = ValidationFailure("file", "The file needs a valid name.");
            return false;
        }

        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (!_options.AllowedExtensions.Contains(extension, StringComparer.OrdinalIgnoreCase))
        {
            error = ValidationFailure("file", "That file type isn't allowed. Upload a Markdown, text, Word, or PDF file.");
            return false;
        }

        if (file.Length > _options.MaxFileBytes)
        {
            var megabytes = _options.MaxFileBytes / (1024 * 1024);
            error = Problem(
                title: "File too large.",
                detail: $"This file is over the {megabytes} MB limit. Try splitting it.",
                statusCode: StatusCodes.Status413RequestEntityTooLarge,
                type: "https://mws.ai/errors/file-too-large");
            return false;
        }

        var contentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType;
        upload = new ToolkitUpload(fileName, contentType, file.Length, file.OpenReadStream());
        return true;
    }

    private IActionResult MapWrite(ToolkitWriteResult result, bool isCreate) => result.Outcome switch
    {
        ToolkitWriteOutcome.Success when isCreate =>
            Created($"/api/v1/toolkit/{result.Item!.Id}", result.Item),
        ToolkitWriteOutcome.Success => Ok(result.Item),
        ToolkitWriteOutcome.Stale => StaleConflict(),
        ToolkitWriteOutcome.BlobFailed => Problem(
            title: "Upload failed.",
            detail: "The file couldn't be stored. Try again in a moment.",
            statusCode: StatusCodes.Status502BadGateway,
            type: "https://mws.ai/errors/upload-failed"),
        ToolkitWriteOutcome.PersistFailed => Problem(
            title: "Save failed.",
            detail: "The item couldn't be saved. Try again in a moment.",
            statusCode: StatusCodes.Status500InternalServerError,
            type: "https://mws.ai/errors/save-failed"),
        _ => AccessDenied(),
    };

    private string? ResolveIfMatch(string? bodyIfMatch)
    {
        var header = Request.Headers.IfMatch.ToString();
        return !string.IsNullOrWhiteSpace(header) ? header.Trim().Trim('"') : bodyIfMatch;
    }

    private string OperationId() =>
        HttpContext.Items.TryGetValue(OperationIdMiddleware.HeaderName, out var value) && value is string operationId
            ? operationId
            : string.Empty;

    private ObjectResult ValidationFailure(string field, string message) =>
        new(new ValidationProblemDetails(new Dictionary<string, string[]> { [field] = new[] { message } })
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
            Detail = "You do not have access to this item.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult NotFoundProblem() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/not-found",
            Title = "No file.",
            Status = StatusCodes.Status404NotFound,
            Detail = "This item has no uploaded file to download.",
        })
        {
            StatusCode = StatusCodes.Status404NotFound,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult StaleConflict() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/stale-record",
            Title = "The record changed.",
            Status = StatusCodes.Status409Conflict,
            Detail = "This item was changed by someone else since you loaded it. Refresh and reapply your edits.",
        })
        {
            StatusCode = StatusCodes.Status409Conflict,
            ContentTypes = { "application/problem+json" },
        };
}

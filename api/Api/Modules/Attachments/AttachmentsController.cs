// Attachments endpoints (Slice 11 — api-contracts.md §8, api-blob-attachments.md). The controller
// only routes / validates at the boundary / maps the service outcome to a status code (api-coding-
// standards.md — no business logic). Access is resolved inside the service: a forbidden OR
// non-existent record both come back Denied/null and map to 403 — never 404 — so existence is never
// disclosed (BS §22.6). Upload validation (allowlist, size, filename sanitize) runs BEFORE any bytes
// stream (api-blob-attachments.md). File names are Confidential-adjacent — never logged.

using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace McDermott.AiTracker.Api.Modules.Attachments;

[ApiController]
[Route("api/v1")]
public sealed class AttachmentsController : ControllerBase
{
    private readonly IAttachmentsService _attachments;
    private readonly ICurrentUser _currentUser;
    private readonly AttachmentsOptions _options;

    public AttachmentsController(
        IAttachmentsService attachments, ICurrentUser currentUser, IOptions<AttachmentsOptions> options)
    {
        _attachments = attachments;
        _currentUser = currentUser;
        _options = options.Value;
    }

    /// <summary>List a record's attachments (any member of the record's workspace).</summary>
    [HttpGet("records/{recordId}/attachments")]
    [ProducesResponseType(typeof(IReadOnlyList<AttachmentDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> ListAttachments([FromRoute] string recordId, CancellationToken cancellationToken)
    {
        var list = await _attachments.ListAsync(recordId, _currentUser.UserId, cancellationToken);
        return list is null ? AccessDenied() : Ok(list);
    }

    /// <summary>Stream an uploaded file to Blob and record it (Member+ on the record's workspace).</summary>
    [HttpPost("records/{recordId}/attachments")]
    [ProducesResponseType(typeof(AttachmentDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status413RequestEntityTooLarge)]
    [ProducesResponseType(StatusCodes.Status502BadGateway)]
    public async Task<IActionResult> UploadAttachment(
        [FromRoute] string recordId,
        IFormFile? file,
        CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return ValidationFailure("file", "Choose a file to upload.");
        }

        // Sanitize the filename (api-validation.md — strip any path; reject traversal / absolute).
        var fileName = Path.GetFileName(file.FileName ?? string.Empty);
        if (string.IsNullOrWhiteSpace(fileName))
        {
            return ValidationFailure("file", "The file needs a valid name.");
        }

        var contentType = file.ContentType ?? string.Empty;
        if (!_options.ContentTypeAllowlist.Contains(contentType, StringComparer.OrdinalIgnoreCase))
        {
            return ValidationFailure("file", "That file type isn't allowed. Upload a document, spreadsheet, or image.");
        }

        // Size is checked before streaming (413 per api-contracts.md §8).
        if (file.Length > _options.MaxFileBytes)
        {
            var megabytes = _options.MaxFileBytes / (1024 * 1024);
            return Problem(
                title: "File too large.",
                detail: $"This file is over the {megabytes} MB limit. Try splitting it.",
                statusCode: StatusCodes.Status413RequestEntityTooLarge,
                type: "https://mws.ai/errors/file-too-large");
        }

        await using var stream = file.OpenReadStream();
        var result = await _attachments.UploadAsync(
            recordId, fileName, contentType, file.Length, stream, _currentUser.UserId, OperationId(), cancellationToken);

        return result.Outcome switch
        {
            AttachmentOutcome.Success => Created($"/api/v1/attachments/{result.Attachment!.Id:D}/content", result.Attachment),
            AttachmentOutcome.Denied => AccessDenied(),
            AttachmentOutcome.BlobFailed => Problem(
                title: "Upload failed.",
                detail: "The file couldn't be stored. Try again in a moment.",
                statusCode: StatusCodes.Status502BadGateway,
                type: "https://mws.ai/errors/upload-failed"),
            _ => Problem(
                title: "Upload failed.",
                detail: "The file was received but couldn't be recorded. Try again in a moment.",
                statusCode: StatusCodes.Status500InternalServerError,
                type: "https://mws.ai/errors/upload-failed"),
        };
    }

    /// <summary>Attach an external URL to a record — no upload (Member+).</summary>
    [HttpPost("records/{recordId}/attachments/link")]
    [ProducesResponseType(typeof(AttachmentDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> LinkAttachment(
        [FromRoute] string recordId,
        [FromBody] AttachmentLinkRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Url) || !IsHttpUrl(request.Url))
        {
            return ValidationFailure("url", "Enter a valid http or https link.");
        }

        if (string.IsNullOrWhiteSpace(request.Title))
        {
            return ValidationFailure("title", "Give the link a title.");
        }

        var attachment = await _attachments.LinkAsync(
            recordId, request.Url.Trim(), request.Title.Trim(), _currentUser.UserId, OperationId(), cancellationToken);
        return attachment is null
            ? AccessDenied()
            : Created($"/api/v1/attachments/{attachment.Id:D}/content", attachment);
    }

    /// <summary>Download an attachment's content. Streams from Blob (native) or redirects (link).</summary>
    [HttpGet("attachments/{id}/content")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status302Found)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> DownloadAttachment([FromRoute] Guid id, CancellationToken cancellationToken)
    {
        var download = await _attachments.GetForDownloadAsync(id, _currentUser.UserId, cancellationToken);
        if (download is null)
        {
            return AccessDenied();
        }

        if (download.IsLink)
        {
            // An external link has no bytes to stream — send the caller to the URL.
            return Redirect(download.ExternalUrl!);
        }

        // Cache-Control: private, no-store is applied to every authenticated response by
        // CacheControlMiddleware (api-coding-standards.md) — attachments must never be edge-cached.
        var stream = await _attachments.GetContentStreamAsync(download, cancellationToken);
        return File(stream, download.ContentType, download.FileName);
    }

    /// <summary>Soft-delete an attachment (Member+). The blob is retained until retention fires.</summary>
    [HttpDelete("attachments/{id}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> DeleteAttachment([FromRoute] Guid id, CancellationToken cancellationToken)
    {
        var deleted = await _attachments.DeleteAsync(id, _currentUser.UserId, OperationId(), cancellationToken);
        return deleted ? NoContent() : AccessDenied();
    }

    private static bool IsHttpUrl(string value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);

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
            Detail = "You do not have access to this record.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };
}

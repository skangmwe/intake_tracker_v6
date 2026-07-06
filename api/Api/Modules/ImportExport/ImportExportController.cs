// Import/Export endpoints (Slice 16 — api-contracts.md §17, BS §13). The controller only routes,
// validates at the boundary, authorizes, and maps the service outcome to a status code
// (api-coding-standards.md — no business logic). CSV upload is WorkspaceAdmin-only and is validated
// (content type + size) BEFORE any bytes stream (api-blob-attachments.md); it hands off and returns
// 202 (api-performance.md). Import status + export both resolve access inside their services: a
// forbidden or non-existent import is 403 (never 404 — BS §22.6); export is 403/404 per the saved
// view. File names and CSV values are Confidential/PII — never logged (api-pii-handling.md).

using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace McDermott.AiTracker.Api.Modules.ImportExport;

[ApiController]
[Route("api/v1")]
public sealed class ImportExportController : ControllerBase
{
    private readonly IImportService _imports;
    private readonly IExportService _exports;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;
    private readonly ImportExportOptions _options;

    public ImportExportController(
        IImportService imports, IExportService exports, IAccessGuard accessGuard, ICurrentUser currentUser,
        IOptions<ImportExportOptions> options)
    {
        _imports = imports;
        _exports = exports;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
        _options = options.Value;
    }

    /// <summary>Upload a CSV to create records (WorkspaceAdmin). Streams to Blob, hands off, returns 202.</summary>
    [HttpPost("workspaces/{workspaceId:guid}/imports/csv")]
    [ProducesResponseType(typeof(ImportStartResponseDto), StatusCodes.Status202Accepted)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status413RequestEntityTooLarge)]
    [ProducesResponseType(StatusCodes.Status502BadGateway)]
    public async Task<IActionResult> ImportCsv(
        [FromRoute] Guid workspaceId,
        IFormFile? file,
        CancellationToken cancellationToken)
    {
        // Admin gate BEFORE streaming — a non-admin never uploads a file (BS §13).
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        if (file is null || file.Length == 0)
        {
            return ValidationFailure("file", "Choose a CSV file to import.");
        }

        var contentType = file.ContentType ?? string.Empty;
        if (!_options.ContentTypeAllowlist.Contains(contentType, StringComparer.OrdinalIgnoreCase))
        {
            return ValidationFailure("file", "That file type isn't allowed. Upload a .csv file.");
        }

        if (file.Length > _options.MaxFileBytes)
        {
            var megabytes = _options.MaxFileBytes / (1024 * 1024);
            return Problem(
                title: "File too large.",
                detail: $"This file is over the {megabytes} MB limit. Split it into smaller files.",
                statusCode: StatusCodes.Status413RequestEntityTooLarge,
                type: "https://mws.ai/errors/file-too-large");
        }

        var fileName = Path.GetFileName(file.FileName ?? string.Empty);
        if (string.IsNullOrWhiteSpace(fileName))
        {
            fileName = "import.csv";
        }

        await using var stream = file.OpenReadStream();
        var result = await _imports.StartAsync(
            workspaceId, fileName, stream, _currentUser.UserId, OperationId(), cancellationToken);

        return result.Outcome switch
        {
            ImportStartOutcome.Success => Accepted(
                $"/api/v1/imports/{result.ImportId:D}",
                new ImportStartResponseDto(result.ImportId, "Processing")),
            ImportStartOutcome.Denied => AccessDenied(),
            _ => Problem(
                title: "Upload failed.",
                detail: "The file couldn't be stored. Try again in a moment.",
                statusCode: StatusCodes.Status502BadGateway,
                type: "https://mws.ai/errors/upload-failed"),
        };
    }

    /// <summary>Poll an import's status + per-row report (WorkspaceAdmin). 403 for a foreign/unknown id.</summary>
    [HttpGet("imports/{importId:guid}")]
    [ProducesResponseType(typeof(ImportStatusResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetImportStatus([FromRoute] Guid importId, CancellationToken cancellationToken)
    {
        var status = await _imports.GetStatusAsync(importId, _currentUser.UserId, cancellationToken);
        return status is null ? AccessDenied() : Ok(status);
    }

    /// <summary>Export a saved view as CSV — columns follow the view, rows follow the caller's entitlements.</summary>
    [HttpPost("exports")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Export([FromBody] ExportRequestBody request, CancellationToken cancellationToken)
    {
        if (request.SavedViewId == Guid.Empty)
        {
            return ValidationFailure("savedViewId", "Choose a saved view to export.");
        }

        var result = await _exports.ExportAsync(request.SavedViewId, _currentUser.UserId, cancellationToken);
        return result.Outcome switch
        {
            ExportOutcome.Success => File(result.Content!, "text/csv", result.FileName),
            ExportOutcome.NotFound => NotFoundProblem(),
            ExportOutcome.Denied => AccessDenied(),
            _ => ValidationFailure("savedViewId", "Only request views can be exported."),
        };
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
            Detail = "You do not have access to this resource.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult NotFoundProblem() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/not-found",
            Title = "Not found.",
            Status = StatusCodes.Status404NotFound,
            Detail = "That saved view no longer exists.",
        })
        {
            StatusCode = StatusCodes.Status404NotFound,
            ContentTypes = { "application/problem+json" },
        };
}

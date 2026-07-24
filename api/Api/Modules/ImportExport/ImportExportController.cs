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
    private readonly IIoObjectRegistry _registry;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;
    private readonly ImportExportOptions _options;

    public ImportExportController(
        IImportService imports, IExportService exports, IIoObjectRegistry registry, IAccessGuard accessGuard,
        ICurrentUser currentUser, IOptions<ImportExportOptions> options)
    {
        _imports = imports;
        _exports = exports;
        _registry = registry;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
        _options = options.Value;
    }

    /// <summary>The importable/exportable object catalog for the workspace's import/export wizards
    /// (Viewer+). Field lists are configuration, not user data.</summary>
    [HttpGet("workspaces/{workspaceId:guid}/io/objects")]
    [ProducesResponseType(typeof(IReadOnlyList<IoObjectDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetIoObjects([FromRoute] Guid workspaceId, CancellationToken cancellationToken)
    {
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.Viewer, cancellationToken))
        {
            return AccessDenied();
        }

        // Export fields can be per-workspace (Request derives them from the workspace field catalog), so
        // resolve each object's export columns for this workspace + caller before shaping the DTO.
        var objects = new List<IoObjectDto>(_registry.All.Count);
        foreach (var ioObject in _registry.All)
        {
            var exportFields = ioObject.CanExport
                ? await ioObject.GetExportFieldsAsync(workspaceId, _currentUser.UserId, cancellationToken)
                : Array.Empty<IoFieldSpec>();
            objects.Add(ToDto(ioObject, exportFields));
        }

        return Ok(objects);
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
        [FromForm(Name = "objectType")] string? objectType,
        [FromForm(Name = "mapping")] string? mapping,
        CancellationToken cancellationToken)
    {
        // Admin gate BEFORE streaming — a non-admin never uploads a file (BS §13).
        if (!await _accessGuard.HasWorkspaceLevelAsync(_currentUser.UserId, workspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken))
        {
            return AccessDenied();
        }

        // Resolve the target object (default Request for backward-compat). Unknown or non-importable → 400.
        var ioObject = _registry.Find(string.IsNullOrWhiteSpace(objectType) ? "Request" : objectType);
        if (ioObject is null || !ioObject.CanImport)
        {
            return ValidationFailure("objectType", "That object can't be imported. Choose an importable object.");
        }

        // Validate the wizard mapping at the boundary (before streaming): every mapped field must belong
        // to the object, and every required field must be mapped. Absent mapping → header auto-match.
        if (!string.IsNullOrWhiteSpace(mapping) && !TryValidateMapping(ioObject, mapping, out var mappingError))
        {
            return ValidationFailure("mapping", mappingError);
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
        var mappingJson = string.IsNullOrWhiteSpace(mapping) ? null : mapping;
        var result = await _imports.StartAsync(
            workspaceId, fileName, stream, _currentUser.UserId, OperationId(), ioObject.ObjectType, mappingJson,
            cancellationToken);

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

    /// <summary>Export an object's chosen columns as CSV (the S28 export wizard). Columns follow the
    /// caller's selection (identity columns always included); rows follow the caller's entitlements.</summary>
    [HttpPost("workspaces/{workspaceId:guid}/exports/object")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> ExportObject(
        [FromRoute] Guid workspaceId, [FromBody] ObjectExportRequestBody request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.ObjectType))
        {
            return ValidationFailure("objectType", "Choose an object to export.");
        }

        var result = await _exports.ExportObjectAsync(
            workspaceId, request.ObjectType, request.FieldKeys, _currentUser.UserId, cancellationToken);
        return result.Outcome switch
        {
            ExportOutcome.Success => File(result.Content!, "text/csv", result.FileName),
            ExportOutcome.Denied => AccessDenied(),
            _ => ValidationFailure("objectType", "That object or one of the chosen fields can't be exported."),
        };
    }

    private static IoObjectDto ToDto(IIoObject ioObject, IReadOnlyList<IoFieldSpec> exportFields) => new(
        ioObject.ObjectType,
        ioObject.Label,
        ioObject.CanImport,
        ioObject.CanExport,
        ioObject.ImportFields.Select(ToFieldDto).ToList(),
        exportFields.Select(ToFieldDto).ToList());

    private static IoFieldSpecDto ToFieldDto(IoFieldSpec field) => new(
        field.Key,
        field.Label,
        field.Required ? true : null,
        field.AlwaysIncluded ? true : null);

    /// <summary>Validate the wizard mapping against the object: parse to a non-empty array, every field
    /// key must belong to the object's import fields, and every required import field must be mapped.</summary>
    private static bool TryValidateMapping(IIoObject ioObject, string mappingJson, out string error)
    {
        List<ImportColumnMapping>? mapping;
        try
        {
            mapping = System.Text.Json.JsonSerializer.Deserialize<List<ImportColumnMapping>>(
                mappingJson, JsonWebOptions);
        }
        catch (System.Text.Json.JsonException)
        {
            error = "The column mapping is not valid.";
            return false;
        }

        if (mapping is not { Count: > 0 })
        {
            error = "Map at least one column before importing.";
            return false;
        }

        var importKeys = new HashSet<string>(ioObject.ImportFields.Select(field => field.Key), StringComparer.Ordinal);
        var mappedKeys = new HashSet<string>(StringComparer.Ordinal);
        foreach (var entry in mapping)
        {
            if (!importKeys.Contains(entry.FieldKey))
            {
                error = "The column mapping references a field that doesn't exist on this object.";
                return false;
            }

            mappedKeys.Add(entry.FieldKey);
        }

        var missingRequired = ioObject.ImportFields.FirstOrDefault(field => field.Required && !mappedKeys.Contains(field.Key));
        if (missingRequired is not null)
        {
            error = $"Map a column to the required field \"{missingRequired.Label}\".";
            return false;
        }

        error = string.Empty;
        return true;
    }

    private static readonly System.Text.Json.JsonSerializerOptions JsonWebOptions =
        new(System.Text.Json.JsonSerializerDefaults.Web);

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

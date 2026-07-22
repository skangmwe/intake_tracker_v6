// Platform field schema endpoints (S34 — api-contracts.md §19). Every endpoint verifies the caller
// carries the additive Platform-admin grant (BS §4.3); a non-admin gets 403 (never 404). The
// controller only routes/validates/authorizes and maps the service result to a status code.

using McDermott.AiTracker.Api.Modules.Fields;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Middleware;
using Microsoft.AspNetCore.Mvc;

namespace McDermott.AiTracker.Api.Modules.PlatformAdmin;

[ApiController]
[Route("api/v1/platform/fields")]
public sealed class PlatformFieldsController : ControllerBase
{
    private readonly IPlatformFieldService _platformFields;
    private readonly IFieldSchemaService _fieldSchema;
    private readonly IAccessGuard _accessGuard;
    private readonly ICurrentUser _currentUser;

    public PlatformFieldsController(
        IPlatformFieldService platformFields,
        IFieldSchemaService fieldSchema,
        IAccessGuard accessGuard,
        ICurrentUser currentUser)
    {
        _platformFields = platformFields;
        _fieldSchema = fieldSchema;
        _accessGuard = accessGuard;
        _currentUser = currentUser;
    }

    /// <summary>The platform-defined field catalog (S34).</summary>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<PlatformFieldDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetPlatformFields(CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return AccessDenied();
        }

        var fields = await _platformFields.GetAllAsync(cancellationToken);
        return Ok(fields);
    }

    /// <summary>The flat platform Fields-tab catalog (S34): system auto-fields on the Global objects,
    /// the platform-defined fields, and every Global field across all workspaces.</summary>
    [HttpGet("catalog")]
    [ProducesResponseType(typeof(PlatformFieldCatalogDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetPlatformFieldCatalog(CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return AccessDenied();
        }

        var catalog = await _fieldSchema.GetPlatformCatalogAsync(cancellationToken);
        return Ok(catalog);
    }

    /// <summary>Edit a platform field's definition (name / options). System fields are immutable.</summary>
    [HttpPatch("{fieldKey}")]
    [ProducesResponseType(typeof(PlatformFieldDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdatePlatformField(
        [FromRoute] string fieldKey,
        [FromBody] PlatformFieldPatchRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
        {
            return AccessDenied();
        }

        var result = await _platformFields.UpdateAsync(
            fieldKey, request.DisplayName!, request.SelectOptions, _currentUser.UserId, OperationId(), cancellationToken);

        return result.Outcome switch
        {
            PlatformFieldOutcome.Success => Ok(result.Field),
            PlatformFieldOutcome.NotFound => NotFound(),
            PlatformFieldOutcome.SystemImmutable => SystemFieldLocked(),
            _ => StatusCode(StatusCodes.Status500InternalServerError),
        };
    }

    private string OperationId() =>
        HttpContext.Items.TryGetValue(OperationIdMiddleware.HeaderName, out var value) && value is string operationId
            ? operationId
            : string.Empty;

    private ObjectResult AccessDenied() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/access-denied",
            Title = "Access denied.",
            Status = StatusCodes.Status403Forbidden,
            Detail = "Only a Platform admin can manage the platform field schema.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };

    private ObjectResult SystemFieldLocked() =>
        new(new ProblemDetails
        {
            Type = "https://mws.ai/errors/platform-defined-field-locked",
            Title = "System field.",
            Status = StatusCodes.Status403Forbidden,
            Detail = "This is a system field and is immutable to everyone, including Platform admins.",
        })
        {
            StatusCode = StatusCodes.Status403Forbidden,
            ContentTypes = { "application/problem+json" },
        };
}

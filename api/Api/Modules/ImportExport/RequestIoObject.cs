// Request import/export descriptor (S28 tabs + wizards; dynamic export — field-surfacing sweep slice
// 3a). The registry entry for the core Request object: it declares the fields a CSV column can map to
// on import, derives the export columns from the workspace's live Request field catalog, projects each
// request's FieldValues JSON map into an export row, and creates one Request per import row (resolving
// the row's Requestor against the firm directory, falling back to the importing admin WITH a flag —
// never silent, BS §13). The export columns come from the SAME catalog the Fields tab reads
// (GetRequestExportFieldsAsync → usp_GetWorkspaceFieldCatalog), so the export picker surfaces every
// Request field and cannot drift from the catalog. Values are read from Requests.FieldValues (the
// single source of every content/derivation value, keyed by field key). Row values / Requestor emails
// are Confidential/PII — written to the response, never logged (api-pii-handling.md).

using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Shared.Schema;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace McDermott.AiTracker.Api.Modules.ImportExport;

public sealed class RequestIoObject : IIoObject, IIoImporter
{
    /// <summary>Page the workspace Requests query at the pagination max (api/CLAUDE.md).</summary>
    private const int ExportPageSize = 100;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    // The identity export column — the RecordId, always emitted (BS §13 — every exported record is
    // identifiable). All other columns are the workspace's stored Request fields (derived at runtime).
    private static readonly IoFieldSpec IdField = new("id", "Record ID", AlwaysIncluded: true);

    // Import targets a CSV column may map to. "name" is the only required field (a request needs a
    // name); the rest are optional. Keys mirror CsvRowMapper's alias targets so the mapping path and
    // the auto-match default set the same fields. (Import stays a bounded, create-path field set — only
    // the EXPORT side is made dynamic in this slice.)
    private static readonly IReadOnlyList<IoFieldSpec> ImportFieldSpecs =
    [
        new("name", "Name", Required: true),
        new("description", "Description"),
        new(CsvRowMapper.RequestorFieldKey, "Requestor (email)"),
        new("deptPgClient", "Dept / PG / Client"),
        new("clientNumber", "Client Number"),
        new("businessValue", "Business Value"),
        new("efficiencyGain", "Efficiency Gain"),
        new("levelOfEffort", "Level of Effort"),
        new("requestType", "Request Type"),
        new("businessOwner", "Business Owner"),
    ];

    private readonly IRequestsService _requests;
    private readonly AppDbContext _db;
    private readonly ImportExportOptions _options;

    public RequestIoObject(IRequestsService requests, AppDbContext db, IOptions<ImportExportOptions> options)
    {
        _requests = requests;
        _db = db;
        _options = options.Value;
    }

    public string ObjectType => "Request";

    public string Label => "Requests";

    public bool CanImport => true;

    public bool CanExport => true;

    public IReadOnlyList<IoFieldSpec> ImportFields => ImportFieldSpecs;

    // Request's catalog comes from stored FieldDefinition rows (per-workspace), not a code manifest, so
    // FieldSchemaService already surfaces them on the Fields tab — nothing is synthesised here.
    public IReadOnlyList<CatalogFieldSpec> CatalogFields => Array.Empty<CatalogFieldSpec>();

    public async Task<IReadOnlyList<IoFieldSpec>> GetExportFieldsAsync(
        Guid workspaceId, Guid userId, CancellationToken cancellationToken)
    {
        // Columns follow the workspace's live Request field catalog — the same source as the Fields tab,
        // so the export picker cannot drift from it. Identity "id" (RecordId) leads; the catalog fields
        // follow in catalog order, deduped against the identity.
        var catalog = await _requests.GetRequestExportFieldsAsync(workspaceId, cancellationToken).ConfigureAwait(false);

        var fields = new List<IoFieldSpec>(catalog.Count + 1) { IdField };
        var seen = new HashSet<string>(StringComparer.Ordinal) { IdField.Key };
        foreach (var field in catalog)
        {
            if (seen.Add(field.Key))
            {
                fields.Add(new IoFieldSpec(field.Key, field.Label));
            }
        }

        return fields;
    }

    public async Task<ExportDataset?> BuildExportAsync(Guid workspaceId, Guid userId, CancellationToken cancellationToken)
    {
        // Columns from the catalog; values from each request's FieldValues JSON. Request rows are
        // workspace-scoped — ExportService's Viewer gate on this workspace IS the entitlement (the query
        // is not further user-filtered), so userId is unused here. (The catalog is read once here and
        // once by ExportService's validation pass — export is a user-initiated download, not a hot path.)
        var columns = await GetExportFieldsAsync(workspaceId, userId, cancellationToken).ConfigureAwait(false);

        var rows = new List<IReadOnlyDictionary<string, object?>>();
        var page = 1;

        while (rows.Count < _options.MaxExportRows)
        {
            var batch = await _requests
                .QueryWorkspaceRequestExportAsync(workspaceId, page, ExportPageSize, cancellationToken)
                .ConfigureAwait(false);

            foreach (var row in batch)
            {
                rows.Add(FieldValuesProjector.Project(row.RecordId, row.FieldValues));
            }

            if (batch.Count < ExportPageSize)
            {
                break;
            }

            page++;
        }

        var trimmed = rows.Count > _options.MaxExportRows
            ? rows.Take(_options.MaxExportRows).ToList()
            : rows;

        return new ExportDataset(columns, trimmed);
    }

    public async Task<ImportRowResult> ImportRowAsync(
        ImportRowContext context, IReadOnlyDictionary<string, string?> fieldValues, CancellationToken cancellationToken)
    {
        var mapped = CsvRowMapper.BuildRequestCreate(fieldValues);
        var reasons = await ResolveRequestorAsync(mapped, context.ActorEmail, cancellationToken).ConfigureAwait(false);

        var result = await _requests
            .CreateAsync(context.WorkspaceId, mapped.Create, context.ActorUserId, context.OperationId, cancellationToken)
            .ConfigureAwait(false);

        return result.Outcome switch
        {
            RequestWriteOutcome.Success => new ImportRowResult(ImportRowResult.Landed, result.Request!.Id, reasons),
            RequestWriteOutcome.ValidationFailed =>
                new ImportRowResult(ImportRowResult.Flagged, null, ImportOutcomeMapper.FromValidationErrors(result.Errors!)),
            _ => new ImportRowResult(ImportRowResult.Flagged, null, ImportOutcomeMapper.GenericFailure()),
        };
    }

    /// <summary>
    /// Resolve the row's Requestor value to a firm user (SSO email). Found → keep the value; provided
    /// but unresolved → default to the importing admin AND flag it (BS §13, never silent); absent →
    /// nothing to resolve, no flag. Mutates the create request's Fields map in place.
    /// </summary>
    private async Task<IReadOnlyList<ImportReasonDto>> ResolveRequestorAsync(
        MappedRow mapped, string fallbackEmail, CancellationToken cancellationToken)
    {
        var requestor = mapped.RequestorValue;
        if (string.IsNullOrWhiteSpace(requestor))
        {
            return Array.Empty<ImportReasonDto>();
        }

        var fields = mapped.Create.Fields ??= new Dictionary<string, JsonElement>(StringComparer.Ordinal);

        var match = await _db.Users.AsNoTracking()
            .FirstOrDefaultAsync(user => user.Email == requestor && !user.IsDisabled, cancellationToken)
            .ConfigureAwait(false);

        if (match is not null)
        {
            fields[CsvRowMapper.RequestorFieldKey] = JsonSerializer.SerializeToElement(requestor, JsonOptions);
            return Array.Empty<ImportReasonDto>();
        }

        fields[CsvRowMapper.RequestorFieldKey] = JsonSerializer.SerializeToElement(fallbackEmail, JsonOptions);
        return new[]
        {
            ImportOutcomeMapper.UnresolvedRequestor(CsvRowMapper.RequestorFieldKey),
            ImportOutcomeMapper.RequestorFallback(CsvRowMapper.RequestorFieldKey),
        };
    }
}

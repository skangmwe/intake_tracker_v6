// Request import/export descriptor (S28 tabs + wizards). The registry entry for the core Request
// object: it declares the fields a CSV column can map to on import and the columns that can be
// emitted on export, projects the access-filtered Requests query into an export dataset, and creates
// one Request per import row (resolving the row's Requestor against the firm directory, falling back
// to the importing admin WITH a flag — never silent, BS §13). Export fields are exactly the keys
// RequestListRow.Columns already carries (id/name/desc/…), so a row's Columns map IS the dataset row —
// no re-shaping. Row values / Requestor emails are Confidential/PII — written to the response, never
// logged (api-pii-handling.md).

using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Requests;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace McDermott.AiTracker.Api.Modules.ImportExport;

public sealed class RequestIoObject : IIoObject, IIoImporter
{
    /// <summary>Page the access-gated Requests query at the pagination max (api/CLAUDE.md).</summary>
    private const int ExportPageSize = 100;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    // Export columns == RequestListRow.Columns keys, in file order. "id" is the identity column and is
    // always emitted (BS §13 — every exported record is identifiable).
    private static readonly IReadOnlyList<IoFieldSpec> ExportFieldSpecs =
    [
        new("id", "Record ID", AlwaysIncluded: true),
        new("name", "Name"),
        new("desc", "Description"),
        new("stage", "Stage"),
        new("origin", "Dept / PG / Client"),
        new("analyst", "Assigned Analyst"),
        new("priority", "Priority"),
        new("repo", "Repo URL"),
        new("due", "Due Date"),
    ];

    // Import targets a CSV column may map to. "name" is the only required field (a request needs a
    // name); the rest are optional. Keys mirror CsvRowMapper's alias targets so the mapping path and
    // the auto-match default set the same fields.
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

    public IReadOnlyList<IoFieldSpec> ExportFields => ExportFieldSpecs;

    public async Task<ExportDataset?> BuildExportAsync(Guid workspaceId, Guid userId, CancellationToken cancellationToken)
    {
        // Request rows are workspace-scoped; ExportService's Viewer gate on this workspace IS the
        // entitlement (the query is not further user-filtered), so userId is unused here.
        var rows = new List<IReadOnlyDictionary<string, object?>>();
        var page = 1;

        while (rows.Count < _options.MaxExportRows)
        {
            var query = new PaginatedQuery
            {
                Page = page,
                PageSize = ExportPageSize,
                Filters = null,
                Sort = new List<SortSpec>(),
            };

            var result = await _requests.QueryAsync(workspaceId, query, cancellationToken).ConfigureAwait(false);

            // RequestListRow.Columns is already keyed by the export field keys — use it as the row.
            foreach (var row in result.Items)
            {
                rows.Add(row.Columns);
            }

            if (result.Items.Count < ExportPageSize || rows.Count >= result.TotalCount)
            {
                break;
            }

            page++;
        }

        var trimmed = rows.Count > _options.MaxExportRows
            ? rows.Take(_options.MaxExportRows).ToList()
            : rows;

        return new ExportDataset(ExportFieldSpecs, trimmed);
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

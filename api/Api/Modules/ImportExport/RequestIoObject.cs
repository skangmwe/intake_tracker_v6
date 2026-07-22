// Request import/export descriptor (S28 tabs + wizards). The registry entry for the core Request
// object: it declares the fields a CSV column can map to on import and the columns that can be
// emitted on export, and projects the access-filtered Requests query into an export dataset. Export
// fields are exactly the keys RequestListRow.Columns already carries (id/name/desc/…), so a row's
// Columns map IS the dataset row — no re-shaping. Import fields mirror the CsvRowMapper alias targets
// so the explicit-mapping path can set the same fields the auto-match default does. Row values are
// Confidential — written to the response, never logged (api-pii-handling.md).

using McDermott.AiTracker.Api.Modules.Requests;
using Microsoft.Extensions.Options;

namespace McDermott.AiTracker.Api.Modules.ImportExport;

public sealed class RequestIoObject : IIoObject
{
    /// <summary>Page the access-gated Requests query at the pagination max (api/CLAUDE.md).</summary>
    private const int ExportPageSize = 100;

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
    private readonly ImportExportOptions _options;

    public RequestIoObject(IRequestsService requests, IOptions<ImportExportOptions> options)
    {
        _requests = requests;
        _options = options.Value;
    }

    public string ObjectType => "Request";

    public string Label => "Requests";

    public bool CanImport => true;

    public bool CanExport => true;

    public IReadOnlyList<IoFieldSpec> ImportFields => ImportFieldSpecs;

    public IReadOnlyList<IoFieldSpec> ExportFields => ExportFieldSpecs;

    public async Task<ExportDataset> BuildExportAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
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
}

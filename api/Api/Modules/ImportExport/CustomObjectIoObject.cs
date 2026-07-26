// Custom-object import/export descriptor (SP5). The registry entry for one admin-created custom object
// (dbo.ObjectDefinition, IsSystem=0). Structurally identical to RequestIoObject/FeatureIoObject — a
// dynamic FieldValues object — but keyed by the object's slug and carrying a first-class Name column.
// Its export/import field lists are precomputed by CustomObjectIoObjectFactory (which resolves the
// workspace field schema once), because IIoObject.ImportFields is a synchronous property. Export pages
// the generic records query and projects each record's FieldValues (shared FieldValuesProjector),
// injecting the identity "id" and first-class "name". Import creates one record per row (create-only),
// mapping mapped cells to the record's Name + Fields bag, storing each field cell as a JSON string
// (like RequestIoObject) and DROPPING any key not in this object's schema — so a Request-alias key that
// leaks in via the (UI-unreachable) no-mapping path can never pollute a custom record. Field values are
// Confidential — written to the response, never logged (api-pii-handling.md).

using System.Text.Json;
using McDermott.AiTracker.Api.Modules.CustomRecords;
using McDermott.AiTracker.Api.Modules.Requests; // PaginatedQuery
using McDermott.AiTracker.Api.Shared.Schema;

namespace McDermott.AiTracker.Api.Modules.ImportExport;

public sealed class CustomObjectIoObject : IIoObject, IIoImporter
{
    /// <summary>Page the generic records query at the pagination max (api/CLAUDE.md).</summary>
    private const int ExportPageSize = 100;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly Guid _objectDefinitionId;
    private readonly string _objectKey;
    private readonly string _label;
    private readonly IReadOnlyList<IoFieldSpec> _exportFields;
    private readonly IReadOnlyList<IoFieldSpec> _importFields;
    private readonly HashSet<string> _userFieldKeys; // import target keys minus the first-class "name"
    private readonly ICustomRecordsService _records;
    private readonly int _maxExportRows;

    public CustomObjectIoObject(
        Guid objectDefinitionId, string objectKey, string label,
        IReadOnlyList<IoFieldSpec> exportFields, IReadOnlyList<IoFieldSpec> importFields,
        ICustomRecordsService records, int maxExportRows)
    {
        _objectDefinitionId = objectDefinitionId;
        _objectKey = objectKey;
        _label = label;
        _exportFields = exportFields;
        _importFields = importFields;
        _userFieldKeys = new HashSet<string>(
            importFields.Where(f => !string.Equals(f.Key, "name", StringComparison.Ordinal)).Select(f => f.Key),
            StringComparer.Ordinal);
        _records = records;
        _maxExportRows = maxExportRows;
    }

    public string ObjectType => _objectKey;

    public string Label => _label;

    public bool CanImport => true;

    public bool CanExport => true;

    // Upsert matching (Record ID lookup) is not yet implemented in ImportRowAsync below — this stays
    // create-only until a later task wires the match-by-Record-ID path, then flips to true.
    public bool CanUpsert => false;

    public IReadOnlyList<IoFieldSpec> ImportFields => _importFields;

    // Custom-object fields are stored FieldDefinition rows surfaced by FieldSchemaService — nothing is
    // synthesised into the Fields catalog here.
    public IReadOnlyList<CatalogFieldSpec> CatalogFields => Array.Empty<CatalogFieldSpec>();

    public Task<IReadOnlyList<IoFieldSpec>> GetExportFieldsAsync(
        Guid workspaceId, Guid userId, CancellationToken cancellationToken) =>
        Task.FromResult(_exportFields);

    public async Task<ExportDataset?> BuildExportAsync(Guid workspaceId, Guid userId, CancellationToken cancellationToken)
    {
        var rows = new List<IReadOnlyDictionary<string, object?>>();
        var page = 1;

        while (rows.Count < _maxExportRows)
        {
            var result = await _records
                .QueryAsync(workspaceId, _objectDefinitionId, new PaginatedQuery { Page = page, PageSize = ExportPageSize }, cancellationToken)
                .ConfigureAwait(false);
            if (result is null)
            {
                // The object is out of scope for the caller → 403 (never a silent empty file).
                return null;
            }

            foreach (var record in result.Items)
            {
                var cells = FieldValuesProjector.Project(record.Fields);
                cells["id"] = record.Id.ToString();
                cells["name"] = record.Name; // first-class Name column wins over any "name" field
                rows.Add(cells);
            }

            if (result.Items.Count < ExportPageSize || rows.Count >= result.TotalCount)
            {
                break;
            }

            page++;
        }

        var trimmed = rows.Count > _maxExportRows ? rows.Take(_maxExportRows).ToList() : rows;
        return new ExportDataset(_exportFields, trimmed);
    }

    public async Task<ImportRowResult> ImportRowAsync(
        ImportRowContext context, IReadOnlyDictionary<string, string?> fieldValues, CancellationToken cancellationToken)
    {
        string? name = null;
        var fields = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        foreach (var (key, rawValue) in fieldValues)
        {
            var value = rawValue?.Trim();
            if (string.IsNullOrEmpty(value))
            {
                continue;
            }

            if (string.Equals(key, "name", StringComparison.Ordinal))
            {
                name = value;
            }
            else if (_userFieldKeys.Contains(key))
            {
                // Store each cell as a JSON string (v1 — like RequestIoObject). Number/date/select fields
                // are stored as their raw CSV string; downstream tolerates it (the query proc TRY_CASTs for
                // sort, the projector renders as-is). Keys not in this object's schema are dropped.
                fields[key] = JsonSerializer.SerializeToElement(value, JsonOptions);
            }
        }

        var request = new CustomRecordWriteRequest(name, fields);
        var result = await _records
            .CreateAsync(context.WorkspaceId, _objectDefinitionId, request, context.ActorUserId, cancellationToken)
            .ConfigureAwait(false);

        return result.Outcome switch
        {
            CustomRecordWriteOutcome.Success =>
                new ImportRowResult(ImportRowResult.Landed, result.Record!.Id.ToString(), Array.Empty<ImportReasonDto>()),
            CustomRecordWriteOutcome.ValidationFailed =>
                new ImportRowResult(ImportRowResult.Flagged, null, ImportOutcomeMapper.FromValidationErrors(result.Errors!)),
            _ => new ImportRowResult(ImportRowResult.Flagged, null, ImportOutcomeMapper.GenericFailure()),
        };
    }
}

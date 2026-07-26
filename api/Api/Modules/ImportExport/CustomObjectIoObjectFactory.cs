// Builds a CustomObjectIoObject for one custom object (SP5). Because IIoObject.ImportFields is a
// synchronous property, the descriptor's export/import column lists are precomputed here: this resolves
// the object's workspace field schema once (IFieldSchemaService.GetSchemaAsync, which handles the custom
// slug), then constructs the descriptor with the identity columns + the object's user fields. Retired
// fields and any user field keyed "id"/"name" (which would clash with the identity columns) are excluded.

using McDermott.AiTracker.Api.Modules.CustomRecords;
using McDermott.AiTracker.Api.Modules.Fields;
using McDermott.AiTracker.Api.Modules.Objects;
using Microsoft.Extensions.Options;

namespace McDermott.AiTracker.Api.Modules.ImportExport;

public interface ICustomObjectIoObjectFactory
{
    /// <summary>Build the import/export descriptor for one already-resolved custom object, for the given
    /// workspace + caller. Reads the object's field schema to derive its columns.</summary>
    Task<IIoObject> CreateAsync(
        Guid workspaceId, ObjectDefinitionDto definition, Guid userId, CancellationToken cancellationToken);
}

public sealed class CustomObjectIoObjectFactory : ICustomObjectIoObjectFactory
{
    private static readonly IoFieldSpec IdField = new("id", "Record ID", AlwaysIncluded: true);
    private static readonly IoFieldSpec NameExportField = new("name", "Name", AlwaysIncluded: true);
    private static readonly IoFieldSpec NameImportField = new("name", "Name", Required: true);

    private readonly ICustomRecordsService _records;
    private readonly IFieldSchemaService _fields;
    private readonly ImportExportOptions _options;

    public CustomObjectIoObjectFactory(
        ICustomRecordsService records, IFieldSchemaService fields, IOptions<ImportExportOptions> options)
    {
        _records = records;
        _fields = fields;
        _options = options.Value;
    }

    public async Task<IIoObject> CreateAsync(
        Guid workspaceId, ObjectDefinitionDto definition, Guid userId, CancellationToken cancellationToken)
    {
        var schema = await _fields.GetSchemaAsync(workspaceId, definition.ObjectKey, cancellationToken).ConfigureAwait(false);

        // The object's user fields, minus retired fields and any that clash with the identity columns.
        var userFields = schema.Fields
            .Where(field => !field.IsRetired && !IsIdentityKey(field.FieldKey))
            .ToList();

        var exportFields = new List<IoFieldSpec>(userFields.Count + 2) { IdField, NameExportField };
        exportFields.AddRange(userFields.Select(field => new IoFieldSpec(field.FieldKey, field.DisplayName)));

        var importFields = new List<IoFieldSpec>(userFields.Count + 1) { NameImportField };
        importFields.AddRange(userFields.Select(field => new IoFieldSpec(field.FieldKey, field.DisplayName, Required: field.IsRequired)));

        return new CustomObjectIoObject(
            definition.Id,
            definition.ObjectKey,
            definition.PluralLabel ?? definition.Name,
            exportFields,
            importFields,
            _records,
            _options.MaxExportRows);
    }

    private static bool IsIdentityKey(string key) =>
        string.Equals(key, "id", StringComparison.OrdinalIgnoreCase)
        || string.Equals(key, "name", StringComparison.OrdinalIgnoreCase);
}

// Toolkit-item import/export descriptor (field-surfacing sweep, Approach B). Export-only registry
// entry for the Toolkit item object. Its field manifest is the SINGLE source: the same list drives the
// export picker (ExportFields), the exported values (BuildExportAsync), and the Fields & objects catalog
// (CatalogFields). Toolkit items are workspace-scoped, so export access is the caller's Viewer membership
// on the passed workspace — enforced upstream by ExportService before this runs (BS §22.4 — export never
// widens access), so BuildExportAsync never returns null. Toolkit items are authored in their own editor,
// not imported field-by-field, so the object is not importable.

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Toolkit;
using McDermott.AiTracker.Api.Shared.Schema;
using Microsoft.Extensions.Options;

namespace McDermott.AiTracker.Api.Modules.ImportExport;

public sealed class ToolkitIoObject : IIoObject
{
    /// <summary>Page the workspace toolkit query at the pagination max (api/CLAUDE.md).</summary>
    private const int ExportPageSize = 100;

    // The single field manifest — drives export columns, exported values, and the catalog. "name" is the
    // readable identity column and is always emitted (BS §13 — every exported record is identifiable).
    private static readonly IReadOnlyList<ObjectFieldSpec<WorkspaceToolkitExportRow>> Manifest =
    [
        new("name", "Name", "ShortText", row => row.Name, IsIdentity: true),
        new("recordId", "Record ID", "ShortText", row => row.RecordId),
        new("kind", "Kind", "SingleSelect", row => row.Kind),
        new("status", "Status", "SingleSelect", row => row.Status),
        new("oneLiner", "One-liner", "ShortText", row => row.OneLiner),
        new("description", "Description", "LongText", row => row.Description),
        new("maintainer", "Maintainer", "ShortText", row => row.Maintainer),
        new("howTo", "How to use", "LongText", row => row.HowTo),
        new("body", "Body", "LongText", row => row.BodyMarkdown),
        new("hasAttachment", "Has attachment", "Boolean", row => row.HasAttachment),
        new("attachmentFileName", "Attachment file name", "ShortText", row => row.AttachmentFileName),
        new("updatedAt", "Last updated", "DateTime", row => row.UpdatedAt),
        new("updatedBy", "Updated by", "UserReference", row => row.UpdatedByName),
    ];

    private static readonly IReadOnlyList<IoFieldSpec> ExportFieldSpecs = ManifestSupport.ExportFieldsFrom(Manifest);
    private static readonly IReadOnlyList<CatalogFieldSpec> CatalogFieldSpecs =
        ManifestSupport.CatalogFieldsFrom("ToolkitItem", Manifest);

    private readonly IToolkitService _toolkit;
    private readonly ImportExportOptions _options;

    public ToolkitIoObject(IToolkitService toolkit, IOptions<ImportExportOptions> options)
    {
        _toolkit = toolkit;
        _options = options.Value;
    }

    public string ObjectType => "ToolkitItem";

    public string Label => "Toolkit items";

    public bool CanImport => false;

    public bool CanExport => true;

    public IReadOnlyList<IoFieldSpec> ImportFields => Array.Empty<IoFieldSpec>();

    // Toolkit item is fixed-column — its export fields do not vary per workspace.
    public Task<IReadOnlyList<IoFieldSpec>> GetExportFieldsAsync(
        Guid workspaceId, Guid userId, CancellationToken cancellationToken) => Task.FromResult(ExportFieldSpecs);

    public IReadOnlyList<CatalogFieldSpec> CatalogFields => CatalogFieldSpecs;

    public async Task<ExportDataset?> BuildExportAsync(Guid workspaceId, Guid userId, CancellationToken cancellationToken)
    {
        // Toolkit items are workspace-scoped; ExportService's Viewer gate on this workspace IS the
        // entitlement (the query is not further user-filtered), so userId is unused here.
        var rows = new List<IReadOnlyDictionary<string, object?>>();
        var page = 1;

        while (rows.Count < _options.MaxExportRows)
        {
            var batch = await _toolkit
                .QueryWorkspaceToolkitAsync(workspaceId, page, ExportPageSize, cancellationToken)
                .ConfigureAwait(false);

            foreach (var row in batch)
            {
                rows.Add(ManifestSupport.Project(Manifest, row));
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

        return new ExportDataset(ExportFieldSpecs, trimmed);
    }
}

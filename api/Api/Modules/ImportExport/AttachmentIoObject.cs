// Attachment import/export descriptor (field-surfacing sweep, Approach B). Export-only registry entry
// for the Attachment object. Its field manifest is the SINGLE source: the same list drives the export
// picker (ExportFields), the exported values (BuildExportAsync), and the Fields & objects catalog
// (CatalogFields). Attachments are workspace-scoped, so export access is the caller's Viewer membership
// on the passed workspace — enforced upstream by ExportService before this runs (BS §22.4 — export never
// widens access), so BuildExportAsync never returns null. Attachments are stored, never edited field-by-
// field, so Attachment is not importable. File names are Confidential-adjacent — written to the response,
// never logged (api-pii-handling.md).

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Attachments;
using McDermott.AiTracker.Api.Shared.Schema;
using Microsoft.Extensions.Options;

namespace McDermott.AiTracker.Api.Modules.ImportExport;

public sealed class AttachmentIoObject : IIoObject
{
    /// <summary>Page the workspace attachment query at the pagination max (api/CLAUDE.md).</summary>
    private const int ExportPageSize = 100;

    // The single field manifest — drives export columns, exported values, and the catalog. "fileName"
    // is the readable identity column and is always emitted (BS §13 — every exported record is
    // identifiable).
    private static readonly IReadOnlyList<ObjectFieldSpec<WorkspaceAttachmentExportRow>> Manifest =
    [
        new("fileName", "File name", "ShortText", row => row.FileName, IsIdentity: true),
        new("request", "Parent record", "RecordReference", row => row.RecordId),
        new("parentType", "Parent type", "ShortText", row => row.ObjectType),
        new("contentType", "Content type", "ShortText", row => row.ContentType),
        new("sizeBytes", "Size (bytes)", "Number", row => row.SizeBytes),
        new("kind", "Kind", "SingleSelect", row => row.IsLink ? "Link" : "File"),
        new("externalUrl", "External URL", "Url", row => row.ExternalUrl),
        new("uploadedAt", "Uploaded date", "DateTime", row => row.CreatedAt),
        new("uploadedBy", "Uploaded by", "UserReference", row => row.UploadedByName),
    ];

    private static readonly IReadOnlyList<IoFieldSpec> ExportFieldSpecs = ManifestSupport.ExportFieldsFrom(Manifest);
    private static readonly IReadOnlyList<CatalogFieldSpec> CatalogFieldSpecs =
        ManifestSupport.CatalogFieldsFrom("Attachment", Manifest);

    private readonly IAttachmentsService _attachments;
    private readonly ImportExportOptions _options;

    public AttachmentIoObject(IAttachmentsService attachments, IOptions<ImportExportOptions> options)
    {
        _attachments = attachments;
        _options = options.Value;
    }

    public string ObjectType => "Attachment";

    public string Label => "Attachments";

    public bool CanImport => false;

    public bool CanExport => true;

    public IReadOnlyList<IoFieldSpec> ImportFields => Array.Empty<IoFieldSpec>();

    // Attachment is fixed-column — its export fields do not vary per workspace.
    public Task<IReadOnlyList<IoFieldSpec>> GetExportFieldsAsync(
        Guid workspaceId, Guid userId, CancellationToken cancellationToken) => Task.FromResult(ExportFieldSpecs);

    public IReadOnlyList<CatalogFieldSpec> CatalogFields => CatalogFieldSpecs;

    public async Task<ExportDataset?> BuildExportAsync(Guid workspaceId, Guid userId, CancellationToken cancellationToken)
    {
        // Attachments are workspace-scoped; ExportService's Viewer gate on this workspace IS the
        // entitlement (the query is not further user-filtered), so userId is unused here.
        var rows = new List<IReadOnlyDictionary<string, object?>>();
        var page = 1;

        while (rows.Count < _options.MaxExportRows)
        {
            var batch = await _attachments
                .QueryWorkspaceAttachmentsAsync(workspaceId, page, ExportPageSize, cancellationToken)
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

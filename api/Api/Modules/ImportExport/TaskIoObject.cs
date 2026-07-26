// Task import/export descriptor (S28 tabs + wizards; onto the manifest — field-surfacing sweep,
// Approach B). The registry entry for the Task object: export-only. Its field manifest is the single
// source of the exported columns — the same list drives the export picker (ExportFields) and the
// exported values (BuildExportAsync). Task's *catalog* is NOT synthesised here: its fields already
// live as stored FieldDefinition rows (the six read-only Global attribute rows seeded by migration
// 075 — Request/Assignee/Status/Phase/Completed date/Notes — plus the workspace task-field library,
// plus the five system auto-fields), so CatalogFields is empty to avoid duplicating them. Tasks are
// workspace-scoped, so export access is the caller's Viewer membership on the passed workspace —
// enforced upstream by ExportService before this runs (BS §22.4 — export never widens access), so
// BuildExportAsync never returns null. Task attributes are read-only/derived, so Task is not
// importable (no IIoImporter). Task titles, notes, and captured field values are Confidential —
// written to the response, never logged (api-pii-handling.md).

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Tasks;
using McDermott.AiTracker.Api.Shared.Schema;
using Microsoft.Extensions.Options;

namespace McDermott.AiTracker.Api.Modules.ImportExport;

public sealed class TaskIoObject : IIoObject
{
    /// <summary>Page the workspace task query at the pagination max (api/CLAUDE.md).</summary>
    private const int ExportPageSize = 100;

    // The single field manifest — drives the export columns and the exported values. "task" (the task
    // title) is the readable identity column and is always emitted (BS §13 — every exported record is
    // identifiable). "field" / "fieldValue" carry the one captured typed field (label + coalesced value;
    // CK_Tasks_OneFieldValue guarantees at most one value column is set). FieldType is declarative only
    // — Task contributes no catalog rows, so it feeds nothing today, but keeps the manifest self-describing.
    private static readonly IReadOnlyList<ObjectFieldSpec<WorkspaceTaskExportRow>> Manifest =
    [
        new("task", "Task", "ShortText", row => row.Title, IsIdentity: true),
        new("request", "Request", "RecordReference", row => row.RecordId),
        new("assignee", "Assignee", "UserReference", row => row.AssigneeName),
        new("status", "Status", "SingleSelect", row => row.Status),
        new("phase", "Phase", "SingleSelect", row => row.Phase),
        new("completedDate", "Completed date", "DateTime", row => row.CompletedAt),
        new("notes", "Notes", "LongText", row => row.Notes),
        new("field", "Field", "ShortText", row => row.FieldLabel),
        new("fieldValue", "Field value", "ShortText", row => row.FieldValue),
        new("createdAt", "Date created", "DateTime", row => row.CreatedAt),
        new("createdBy", "Created by", "UserReference", row => row.CreatedByName),
    ];

    private static readonly IReadOnlyList<IoFieldSpec> ExportFieldSpecs = ManifestSupport.ExportFieldsFrom(Manifest);

    private readonly ITasksService _tasks;
    private readonly ImportExportOptions _options;

    public TaskIoObject(ITasksService tasks, IOptions<ImportExportOptions> options)
    {
        _tasks = tasks;
        _options = options.Value;
    }

    public string ObjectType => "Task";

    public string Label => "Tasks";

    public bool CanImport => false;

    public bool CanExport => true;

    public bool CanUpsert => false;

    public IReadOnlyList<IoFieldSpec> ImportFields => Array.Empty<IoFieldSpec>();

    // Task is fixed-column — its export fields do not vary per workspace.
    public Task<IReadOnlyList<IoFieldSpec>> GetExportFieldsAsync(
        Guid workspaceId, Guid userId, CancellationToken cancellationToken) => Task.FromResult(ExportFieldSpecs);

    // Task's catalog comes from stored FieldDefinition rows (the six Global attribute fields from
    // migration 075 + the workspace task-field library) plus the five synthesised system auto-fields,
    // so nothing is synthesised from the manifest here — that would duplicate the stored rows.
    public IReadOnlyList<CatalogFieldSpec> CatalogFields => Array.Empty<CatalogFieldSpec>();

    public async Task<ExportDataset?> BuildExportAsync(Guid workspaceId, Guid userId, CancellationToken cancellationToken)
    {
        // Tasks are workspace-scoped; ExportService's Viewer gate on this workspace IS the entitlement
        // (the query is not further user-filtered), so userId is unused here.
        var rows = new List<IReadOnlyDictionary<string, object?>>();
        var page = 1;

        while (rows.Count < _options.MaxExportRows)
        {
            var batch = await _tasks
                .QueryWorkspaceTasksAsync(workspaceId, page, ExportPageSize, cancellationToken)
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

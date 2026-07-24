// Task import/export descriptor (S28 tabs + wizards). The registry entry for the Task object:
// export-only. It declares the columns emitted on export and projects the workspace-wide task
// query into an export dataset. Tasks are workspace-scoped, so export access is the caller's
// Viewer membership on the passed workspace — enforced upstream by ExportService before this runs
// (BS §22.4 — export never widens access), so BuildExportAsync never returns null. Task attributes
// are read-only/derived, so Task is not importable (no IIoImporter). Task titles and notes are
// Confidential — written to the response, never logged (api-pii-handling.md).

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Tasks;
using Microsoft.Extensions.Options;

namespace McDermott.AiTracker.Api.Modules.ImportExport;

public sealed class TaskIoObject : IIoObject
{
    /// <summary>Page the workspace task query at the pagination max (api/CLAUDE.md).</summary>
    private const int ExportPageSize = 100;

    // Export columns, in file order. "task" (the task title) is the identity column and is always
    // emitted (BS §13 — every exported record is identifiable). "request" is the parent Request id.
    private static readonly IReadOnlyList<IoFieldSpec> ExportFieldSpecs =
    [
        new("task", "Task", AlwaysIncluded: true),
        new("request", "Request"),
        new("assignee", "Assignee"),
        new("status", "Status"),
        new("phase", "Phase"),
        new("completedDate", "Completed date"),
        new("notes", "Notes"),
    ];

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

    public IReadOnlyList<IoFieldSpec> ImportFields => Array.Empty<IoFieldSpec>();

    public IReadOnlyList<IoFieldSpec> ExportFields => ExportFieldSpecs;

    // Task's catalog comes from stored FieldDefinition rows (the 6 Global attribute fields + the task
    // library); its fixed columns move onto the manifest in a later slice.
    public IReadOnlyList<Shared.Schema.CatalogFieldSpec> CatalogFields => Array.Empty<Shared.Schema.CatalogFieldSpec>();

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
                rows.Add(ProjectRow(row));
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

    private static IReadOnlyDictionary<string, object?> ProjectRow(WorkspaceTaskExportRow row) =>
        new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["task"] = row.Title,
            ["request"] = row.RecordId,
            ["assignee"] = row.AssigneeName,
            ["status"] = row.Status,
            ["phase"] = row.Phase,
            ["completedDate"] = row.CompletedAt,
            ["notes"] = row.Notes,
        };
}

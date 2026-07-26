// Export-view service (Slice 16 — api-contracts.md §17, BS §13). Streams a saved view to CSV: the
// columns follow the view, the rows follow the caller's entitlements (BS §22.4 — export never widens
// access). It has NO DbContext — it composes ISavedViewsService (the view definition),
// IRequestsService.QueryAsync (the already-access-filtered rows), and IAccessGuard (the caller's
// membership gate), so it is fully unit-testable. Access: an unknown view is 404; a personal view not
// owned by the caller, or any view whose workspace the caller is not a Viewer of, is 403 (never
// disclosing existence for the workspace side). Only Request-object views export in R1 (the S2 Export
// button); other object types return Unsupported (400). Row values are Confidential — written to the
// response, never logged (api-pii-handling.md).

using System.Text;
using System.Text.Json;
using McDermott.AiTracker.Api.Modules.Requests;
using McDermott.AiTracker.Api.Modules.SavedViews;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.Extensions.Options;

namespace McDermott.AiTracker.Api.Modules.ImportExport;

public enum ExportOutcome
{
    Success,
    /// <summary>The saved view id does not exist — 404 (a view is not access-hidden like a record).</summary>
    NotFound,
    /// <summary>Personal view not owned by the caller, or the caller is not a Viewer of the workspace — 403.</summary>
    Denied,
    /// <summary>The view targets a non-Request object — export is Request-only in R1 (400).</summary>
    Unsupported,
}

public sealed record ExportResult(ExportOutcome Outcome, byte[]? Content = null, string? FileName = null);

public interface IExportService
{
    Task<ExportResult> ExportAsync(Guid savedViewId, Guid userId, CancellationToken cancellationToken);

    /// <summary>Export an object's chosen columns to CSV (the S28 export wizard). Columns follow the
    /// caller's selection (identity columns always included); rows follow the caller's entitlements.</summary>
    Task<ExportResult> ExportObjectAsync(
        Guid workspaceId, string? objectType, IReadOnlyList<string>? fieldKeys, Guid userId,
        CancellationToken cancellationToken);
}

public sealed class ExportService : IExportService
{
    /// <summary>Page the access-gated Requests query at the pagination max (api/CLAUDE.md).</summary>
    private const int ExportPageSize = 100;

    private readonly ISavedViewsService _savedViews;
    private readonly IRequestsService _requests;
    private readonly IAccessGuard _accessGuard;
    private readonly IIoObjectRegistry _registry;
    private readonly ImportExportOptions _options;

    public ExportService(
        ISavedViewsService savedViews, IRequestsService requests, IAccessGuard accessGuard,
        IIoObjectRegistry registry, IOptions<ImportExportOptions> options)
    {
        _savedViews = savedViews;
        _requests = requests;
        _accessGuard = accessGuard;
        _registry = registry;
        _options = options.Value;
    }

    public async Task<ExportResult> ExportObjectAsync(
        Guid workspaceId, string? objectType, IReadOnlyList<string>? fieldKeys, Guid userId,
        CancellationToken cancellationToken)
    {
        // Viewer membership IS the row-level entitlement for the workspace's records, so the export can
        // only ever contain rows the caller may already see (BS §22.4 — export never widens access).
        // Gate BEFORE resolving the object descriptor: resolving a custom object's slug touches the
        // database, so checking access first denies an unauthorized caller without doing that work,
        // and prevents a cross-workspace slug-existence oracle (Denied vs. Unsupported would otherwise
        // reveal whether a given custom-object slug exists in a workspace the caller cannot see).
        if (!await _accessGuard.HasWorkspaceLevelAsync(userId, workspaceId, WorkspaceLevel.Viewer, cancellationToken).ConfigureAwait(false))
        {
            return new ExportResult(ExportOutcome.Denied);
        }

        var ioObject = await _registry.FindForWorkspaceAsync(workspaceId, objectType, userId, cancellationToken).ConfigureAwait(false);
        if (ioObject is null || !ioObject.CanExport)
        {
            return new ExportResult(ExportOutcome.Unsupported);
        }

        // The object's export fields can be per-workspace (Request derives them from the workspace field
        // catalog), so resolve them for this workspace + caller before validating the requested subset.
        var exportFields = await ioObject.GetExportFieldsAsync(workspaceId, userId, cancellationToken).ConfigureAwait(false);

        // Every requested key must be one of the object's export fields — an unknown key is a 400.
        var requested = new HashSet<string>(fieldKeys ?? Array.Empty<string>(), StringComparer.Ordinal);
        var exportKeys = new HashSet<string>(exportFields.Select(field => field.Key), StringComparer.Ordinal);
        if (!requested.IsSubsetOf(exportKeys))
        {
            return new ExportResult(ExportOutcome.Unsupported);
        }

        // Identity columns are always emitted (even if unchecked); order follows the object's field list.
        var columns = exportFields
            .Where(field => field.AlwaysIncluded || requested.Contains(field.Key))
            .ToList();
        if (columns.Count == 0)
        {
            return new ExportResult(ExportOutcome.Unsupported);
        }

        // The descriptor may enforce its own access boundary (e.g. a hub-scoped object gated by the
        // caller's membership rather than the passed workspace) — null means the caller is not entitled
        // to the object at all → 403, never a silent empty file.
        var dataset = await ioObject.BuildExportAsync(workspaceId, userId, cancellationToken).ConfigureAwait(false);
        if (dataset is null)
        {
            return new ExportResult(ExportOutcome.Denied);
        }

        var csv = CsvExportWriter.WriteDataset(columns, dataset.Rows);

        // Neutral filename — never encode a matter / PII into the file name (standards §7).
        return new ExportResult(ExportOutcome.Success, EncodeWithBom(csv), $"{ioObject.ObjectType.ToLowerInvariant()}-export.csv");
    }

    public async Task<ExportResult> ExportAsync(Guid savedViewId, Guid userId, CancellationToken cancellationToken)
    {
        var view = await _savedViews.GetByIdAsync(savedViewId, cancellationToken).ConfigureAwait(false);
        if (view is null)
        {
            return new ExportResult(ExportOutcome.NotFound);
        }

        if (!string.Equals(view.ObjectType, "Request", StringComparison.Ordinal))
        {
            return new ExportResult(ExportOutcome.Unsupported);
        }

        // A personal view is visible only to its owner; any view then needs Viewer+ on its workspace —
        // that membership IS the row-level entitlement for Requests, so the export can only ever contain
        // rows the caller may see (BS §22.4).
        if (string.Equals(view.Scope, "personal", StringComparison.Ordinal) && view.OwnerUserId != userId)
        {
            return new ExportResult(ExportOutcome.Denied);
        }

        if (!await _accessGuard.HasWorkspaceLevelAsync(userId, view.WorkspaceId, WorkspaceLevel.Viewer, cancellationToken).ConfigureAwait(false))
        {
            return new ExportResult(ExportOutcome.Denied);
        }

        var rows = await CollectRowsAsync(view, cancellationToken).ConfigureAwait(false);
        var csv = CsvExportWriter.Write(view.Columns, rows);

        // Neutral filename — never encode a view name / matter / PII into the file name (standards §7).
        return new ExportResult(ExportOutcome.Success, EncodeWithBom(csv), "requests-export.csv");
    }

    /// <summary>Encode CSV text as UTF-8 with a leading BOM so spreadsheet apps read accented
    /// characters correctly.</summary>
    private static byte[] EncodeWithBom(string csv)
    {
        var preamble = Encoding.UTF8.GetPreamble();
        var bytes = new byte[preamble.Length + Encoding.UTF8.GetByteCount(csv)];
        preamble.CopyTo(bytes, 0);
        Encoding.UTF8.GetBytes(csv, 0, csv.Length, bytes, preamble.Length);
        return bytes;
    }

    private async Task<IReadOnlyList<RequestListRow>> CollectRowsAsync(
        SavedViewResponse view, CancellationToken cancellationToken)
    {
        var rows = new List<RequestListRow>();
        var page = 1;

        while (rows.Count < _options.MaxExportRows)
        {
            var query = new PaginatedQuery
            {
                Page = page,
                PageSize = ExportPageSize,
                Filters = view.Filters.Count == 0 ? null : new Dictionary<string, JsonElement>(view.Filters),
                Sort = view.Sort.Select(entry => new SortSpec { Column = entry.Column, Direction = entry.Direction }).ToList(),
            };

            var result = await _requests.QueryAsync(view.WorkspaceId, query, cancellationToken).ConfigureAwait(false);
            rows.AddRange(result.Items);

            if (result.Items.Count < ExportPageSize || rows.Count >= result.TotalCount)
            {
                break;
            }

            page++;
        }

        return rows.Count > _options.MaxExportRows ? rows.Take(_options.MaxExportRows).ToList() : rows;
    }
}

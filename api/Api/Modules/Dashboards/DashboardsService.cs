// Dashboards service (Slice 23 — api-contracts.md §15, BS §10.2-§10.5, module-boundaries.md §15). Owns
// the dashboard list read, the composite dashboard read (metadata + every widget resolved to the caller
// via DashboardMetricResolver), and the S32 audience/rename/retire write. A dashboard never widens
// access: the read is gated here against the dashboard's OWN workspace, and each widget resolves to the
// caller's entitlements inside the resolver's procs. Access on GET is Viewer+ on the dashboard's
// workspace OR a bound Dashboard-viewer (S16) whose membership row is bound to this exact dashboard —
// the bound path forces drill-through off and ignores any drill filter. UpdateAsync requires
// WorkspaceAdmin (S32). Existence is determined before access so an unknown id is 404 and an
// inaccessible-but-existing dashboard is 403 (api-record-access.md).

using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Shared.Auth;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Dashboards;

/// <summary>Outcome of a dashboard read/write — mapped to a status code in the controller.</summary>
public enum DashboardOutcome
{
    Success,
    /// <summary>The caller may not see/edit this dashboard — 403 (never a disclosing 404).</summary>
    Denied,
    /// <summary>The dashboard id does not exist (or is retired) — 404.</summary>
    NotFound,
}

public sealed record DashboardReadResult(DashboardOutcome Outcome, SavedDashboardResponse? Dashboard = null);

public interface IDashboardsService
{
    /// <summary>Dashboards visible in the workspace (S17 + S32). The caller's membership is verified in the controller.</summary>
    Task<DashboardListResponse> ListAsync(Guid workspaceId, Guid userId, CancellationToken cancellationToken);

    /// <summary>One dashboard with every widget resolved to the caller. Access is enforced here (403 vs 404).</summary>
    Task<DashboardReadResult> GetAsync(Guid dashboardId, Guid userId, string? drillJson, CancellationToken cancellationToken);

    /// <summary>Audience edit / rename / retire (S32) — WorkspaceAdmin on the dashboard's workspace.</summary>
    Task<DashboardReadResult> UpdateAsync(Guid dashboardId, DashboardPatchRequest patch, Guid userId, CancellationToken cancellationToken);
}

public sealed class DashboardsService : IDashboardsService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly JsonElement EveryoneAudience = ParseEveryone();

    private readonly AppDbContext _db;
    private readonly IAccessGuard _accessGuard;
    private readonly DashboardMetricResolver _resolver;

    public DashboardsService(AppDbContext db, IAccessGuard accessGuard, DashboardMetricResolver resolver)
    {
        _db = db;
        _accessGuard = accessGuard;
        _resolver = resolver;
    }

    public async Task<DashboardListResponse> ListAsync(Guid workspaceId, Guid userId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<DashboardListRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_ListDashboards @WorkspaceId, @UserId",
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@UserId", userId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var items = rows
            .Select(row => new DashboardListItemResponse(
                Id: row.SavedDashboardId,
                WorkspaceId: row.WorkspaceId,
                Slug: row.Slug,
                Name: row.Name,
                Description: row.Description,
                Audience: ParseAudience(row.AudienceJson),
                IsDefault: row.IsDefault,
                ObjectType: row.ObjectType,
                WidgetCount: row.WidgetCount,
                UpdatedAt: Utc(row.UpdatedAt)))
            .ToList();

        return new DashboardListResponse(workspaceId, items);
    }

    public async Task<DashboardReadResult> GetAsync(
        Guid dashboardId, Guid userId, string? drillJson, CancellationToken cancellationToken)
    {
        var dash = await ReadDashboardAsync(dashboardId, cancellationToken).ConfigureAwait(false);
        if (dash is null)
        {
            return new DashboardReadResult(DashboardOutcome.NotFound);
        }

        // A membership bound to THIS dashboard (S16) grants bound-only access even without general Viewer;
        // it always forces drill-through off. Viewer+ on the workspace grants full access with drill.
        var isBoundToThis = await IsBoundToDashboardAsync(userId, dash.WorkspaceId, dashboardId, cancellationToken).ConfigureAwait(false);
        var hasViewer = await _accessGuard
            .HasWorkspaceLevelAsync(userId, dash.WorkspaceId, WorkspaceLevel.Viewer, cancellationToken)
            .ConfigureAwait(false);
        if (!isBoundToThis && !hasViewer)
        {
            return new DashboardReadResult(DashboardOutcome.Denied);
        }

        var supportsDrill = dash.SupportsDrillThrough && !isBoundToThis;
        var response = await ComposeAsync(dash, supportsDrill, supportsDrill ? drillJson : null, cancellationToken).ConfigureAwait(false);
        return new DashboardReadResult(DashboardOutcome.Success, response);
    }

    public async Task<DashboardReadResult> UpdateAsync(
        Guid dashboardId, DashboardPatchRequest patch, Guid userId, CancellationToken cancellationToken)
    {
        var dash = await ReadDashboardAsync(dashboardId, cancellationToken).ConfigureAwait(false);
        if (dash is null)
        {
            return new DashboardReadResult(DashboardOutcome.NotFound);
        }

        if (!await _accessGuard
                .HasWorkspaceLevelAsync(userId, dash.WorkspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken)
                .ConfigureAwait(false))
        {
            return new DashboardReadResult(DashboardOutcome.Denied);
        }

        var retire = patch.Retire ?? false;
        var audienceJson = patch.Audience is { } audience ? audience.GetRawText() : null;

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_UpdateDashboard @SavedDashboardId, @Name, @AudienceJson, @Retire, @ActorUserId",
            new[]
            {
                new SqlParameter("@SavedDashboardId", dashboardId),
                new SqlParameter("@Name", (object?)patch.Name ?? DBNull.Value),
                new SqlParameter("@AudienceJson", (object?)audienceJson ?? DBNull.Value),
                new SqlParameter("@Retire", retire),
                new SqlParameter("@ActorUserId", userId.ToString()),
            },
            cancellationToken).ConfigureAwait(false);

        if (retire)
        {
            // Nothing to return — the dashboard is soft-retired and no longer readable.
            return new DashboardReadResult(DashboardOutcome.Success);
        }

        var updated = await ReadDashboardAsync(dashboardId, cancellationToken).ConfigureAwait(false);
        if (updated is null)
        {
            return new DashboardReadResult(DashboardOutcome.Success);
        }

        // Admin holds full access, so the recomposed view carries drill per the dashboard's own flag.
        var response = await ComposeAsync(updated, updated.SupportsDrillThrough, drillJson: null, cancellationToken).ConfigureAwait(false);
        return new DashboardReadResult(DashboardOutcome.Success, response);
    }

    private async Task<SavedDashboardResponse> ComposeAsync(
        DashboardRow dash, bool supportsDrill, string? drillJson, CancellationToken cancellationToken)
    {
        var storedWidgets = ParseWidgets(dash.WidgetsJson);
        var widgets = new List<DashboardWidgetResponse>(storedWidgets.Count);
        foreach (var widget in storedWidgets)
        {
            var config = new DashboardWidgetConfigResponse(
                widget.Config.Metric,
                widget.Config.ObjectType,
                widget.Config.SavedViewId);
            var data = await _resolver.ResolveAsync(dash.WorkspaceId, config, drillJson, cancellationToken).ConfigureAwait(false);
            widgets.Add(new DashboardWidgetResponse(widget.Id, widget.Type, widget.Title, config, data));
        }

        return new SavedDashboardResponse(
            Id: dash.SavedDashboardId,
            WorkspaceId: dash.WorkspaceId,
            Slug: dash.Slug,
            Name: dash.Name,
            Description: dash.Description,
            Audience: ParseAudience(dash.AudienceJson),
            IsDefault: dash.IsDefault,
            ObjectType: dash.ObjectType,
            SupportsDrillThrough: supportsDrill,
            Widgets: widgets);
    }

    private async Task<DashboardRow?> ReadDashboardAsync(Guid dashboardId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<DashboardRow>()
            .FromSqlRaw("EXEC dbo.usp_GetDashboardById @SavedDashboardId", new SqlParameter("@SavedDashboardId", dashboardId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return rows.FirstOrDefault();
    }

    // A single-table EF read (no join → stays in EF CRUD per api-data-access.md): the caller's binding for
    // one workspace. Null when they have no membership there or the row is not bound to a dashboard.
    private async Task<bool> IsBoundToDashboardAsync(
        Guid userId, Guid workspaceId, Guid dashboardId, CancellationToken cancellationToken)
    {
        var boundDashboardId = await _db.WorkspaceMemberships
            .AsNoTracking()
            .Where(membership => membership.UserId == userId && membership.WorkspaceId == workspaceId)
            .Select(membership => membership.BoundDashboardId)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        return boundDashboardId == dashboardId;
    }

    private static IReadOnlyList<StoredWidget> ParseWidgets(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return Array.Empty<StoredWidget>();
        }

        try
        {
            return JsonSerializer.Deserialize<List<StoredWidget>>(json, JsonOptions) ?? new List<StoredWidget>();
        }
        catch (JsonException)
        {
            return Array.Empty<StoredWidget>();
        }
    }

    private static JsonElement ParseAudience(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return EveryoneAudience;
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return EveryoneAudience;
        }
    }

    private static JsonElement ParseEveryone()
    {
        using var document = JsonDocument.Parse("{\"kind\":\"everyone\"}");
        return document.RootElement.Clone();
    }

    private static DateTime Utc(DateTime value) => DateTime.SpecifyKind(value, DateTimeKind.Utc);

    // The stored widget shape on the SavedDashboard row (WidgetsJson). Deserialized with Web defaults so
    // camelCase keys (id/type/title/config/metric/objectType/savedViewId) bind directly.
    private sealed record StoredWidget(string Id, string Type, string Title, StoredWidgetConfig Config)
    {
        public StoredWidget() : this(string.Empty, string.Empty, string.Empty, new StoredWidgetConfig())
        {
        }
    }

    private sealed record StoredWidgetConfig(string Metric, string? ObjectType, Guid? SavedViewId)
    {
        public StoredWidgetConfig() : this(string.Empty, null, null)
        {
        }
    }
}

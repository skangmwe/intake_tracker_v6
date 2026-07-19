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
using System.Text.Json.Serialization;
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
    /// <summary>A composer-path mutation (visibility / widgets) was attempted on a seeded dashboard —
    /// 403 <c>seeded-dashboard-read-only</c> (slice 28).</summary>
    SeededReadOnly,
}

public sealed record DashboardReadResult(DashboardOutcome Outcome, SavedDashboardResponse? Dashboard = null);

public interface IDashboardsService
{
    /// <summary>Dashboards visible in the workspace (S17 + S32). The caller's membership is verified in the controller.</summary>
    Task<DashboardListResponse> ListAsync(Guid workspaceId, Guid userId, CancellationToken cancellationToken);

    /// <summary>One dashboard with every widget resolved to the caller. Access is enforced here (403 vs 404).</summary>
    Task<DashboardReadResult> GetAsync(Guid dashboardId, Guid userId, string? drillJson, CancellationToken cancellationToken);

    /// <summary>Audience/name edit + retire (S32) and composer visibility/layout edits (slice 28).
    /// WorkspaceAdmin for a seeded/Shared dashboard; the author for a Personal one. Composer-path
    /// fields on a seeded dashboard return <see cref="DashboardOutcome.SeededReadOnly"/>.</summary>
    Task<DashboardReadResult> UpdateAsync(Guid dashboardId, DashboardPatchRequest patch, Guid userId, CancellationToken cancellationToken);

    /// <summary>Create a user-composed dashboard (slice 28). WorkspaceAdmin for Shared, Member+ for
    /// Personal. Returns the composed dashboard (its widgets resolved to the caller).</summary>
    Task<DashboardReadResult> CreateAsync(Guid workspaceId, DashboardComposeRequest request, Guid userId, CancellationToken cancellationToken);

    /// <summary>Append a widget to a composed dashboard (slice 28). Editor-gated; seeded → SeededReadOnly.</summary>
    Task<DashboardReadResult> AddWidgetAsync(Guid dashboardId, WidgetComposeRequest widget, Guid userId, CancellationToken cancellationToken);

    /// <summary>Update one widget on a composed dashboard by id (slice 28). Editor-gated; seeded → SeededReadOnly.</summary>
    Task<DashboardReadResult> UpdateWidgetAsync(Guid dashboardId, Guid widgetId, WidgetComposeRequest widget, Guid userId, CancellationToken cancellationToken);

    /// <summary>Remove one widget from a composed dashboard by id (slice 28). Editor-gated; seeded → SeededReadOnly.</summary>
    Task<DashboardReadResult> DeleteWidgetAsync(Guid dashboardId, Guid widgetId, Guid userId, CancellationToken cancellationToken);
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
                UpdatedAt: Utc(row.UpdatedAt),
                IsSeeded: row.IsSeeded,
                Visibility: row.Visibility,
                LayoutMode: row.LayoutMode))
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

        // A Personal dashboard (slice 28) is visible to its author only — never to other members.
        if (IsPersonal(dash) && !IsAuthor(dash, userId))
        {
            return new DashboardReadResult(DashboardOutcome.Denied);
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

        // Composer-path fields (visibility / widget layout) are blocked on the seeded starters (slice 28);
        // name / audience / retire (S32) stay editable by a WorkspaceAdmin.
        var touchesComposer = patch.Visibility is not null || patch.Widgets is not null;
        if (touchesComposer && dash.IsSeeded)
        {
            return new DashboardReadResult(DashboardOutcome.SeededReadOnly);
        }

        if (!await CanEditAsync(dash, userId, cancellationToken).ConfigureAwait(false))
        {
            return new DashboardReadResult(DashboardOutcome.Denied);
        }

        var retire = patch.Retire ?? false;
        var audienceJson = patch.Audience is { } audience ? audience.GetRawText() : null;
        var widgetsJson = patch.Widgets is { } widgets ? SerializeWidgets(widgets) : null;

        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_UpdateDashboard @SavedDashboardId, @Name, @AudienceJson, @Retire, @Visibility, @WidgetsJson, @ActorUserId",
            new[]
            {
                new SqlParameter("@SavedDashboardId", dashboardId),
                new SqlParameter("@Name", (object?)patch.Name ?? DBNull.Value),
                new SqlParameter("@AudienceJson", (object?)audienceJson ?? DBNull.Value),
                new SqlParameter("@Retire", retire),
                new SqlParameter("@Visibility", (object?)patch.Visibility ?? DBNull.Value),
                new SqlParameter("@WidgetsJson", (object?)widgetsJson ?? DBNull.Value),
                new SqlParameter("@ActorUserId", userId.ToString()),
            },
            cancellationToken).ConfigureAwait(false);

        if (retire)
        {
            // Nothing to return — the dashboard is soft-retired and no longer readable.
            return new DashboardReadResult(DashboardOutcome.Success);
        }

        return await ReadComposedResultAsync(dashboardId, cancellationToken).ConfigureAwait(false);
    }

    public async Task<DashboardReadResult> CreateAsync(
        Guid workspaceId, DashboardComposeRequest request, Guid userId, CancellationToken cancellationToken)
    {
        var visibility = request.Visibility ?? "Shared";
        var isShared = string.Equals(visibility, "Shared", StringComparison.OrdinalIgnoreCase);

        // Shared dashboards are workspace-managed (WorkspaceAdmin); a Personal dashboard is the caller's
        // own, so a Member may create it.
        var requiredLevel = isShared ? WorkspaceLevel.WorkspaceAdmin : WorkspaceLevel.Member;
        if (!await _accessGuard
                .HasWorkspaceLevelAsync(userId, workspaceId, requiredLevel, cancellationToken)
                .ConfigureAwait(false))
        {
            return new DashboardReadResult(DashboardOutcome.Denied);
        }

        var widgetsJson = request.Widgets is { } widgets ? SerializeWidgets(widgets) : "[]";

        var rows = await _db.Set<CreatedDashboardIdRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_CreateDashboard @WorkspaceId, @Name, @Description, @Visibility, @ObjectType, @WidgetsJson, @ActorUserId",
                new SqlParameter("@WorkspaceId", workspaceId),
                new SqlParameter("@Name", (object?)request.Name ?? DBNull.Value),
                new SqlParameter("@Description", (object?)request.Description ?? DBNull.Value),
                new SqlParameter("@Visibility", visibility),
                new SqlParameter("@ObjectType", (object?)request.ObjectType ?? "Request"),
                new SqlParameter("@WidgetsJson", widgetsJson),
                new SqlParameter("@ActorUserId", userId.ToString()))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var newId = rows.FirstOrDefault()?.SavedDashboardId ?? Guid.Empty;
        return await ReadComposedResultAsync(newId, cancellationToken).ConfigureAwait(false);
    }

    public Task<DashboardReadResult> AddWidgetAsync(
        Guid dashboardId, WidgetComposeRequest widget, Guid userId, CancellationToken cancellationToken) =>
        MutateWidgetsAsync(dashboardId, userId, current =>
        {
            var list = current.ToList();
            list.Add(ToStoredWidget(widget, Guid.NewGuid().ToString(), list.Count));
            return list;
        }, cancellationToken);

    public Task<DashboardReadResult> UpdateWidgetAsync(
        Guid dashboardId, Guid widgetId, WidgetComposeRequest widget, Guid userId, CancellationToken cancellationToken) =>
        MutateWidgetsAsync(dashboardId, userId, current =>
        {
            var list = current.ToList();
            var index = list.FindIndex(stored => string.Equals(stored.Id, widgetId.ToString(), StringComparison.OrdinalIgnoreCase));
            if (index < 0)
            {
                return null; // Unknown widget id → NotFound.
            }

            var sortOrder = list[index].Config.SortOrder ?? index;
            list[index] = ToStoredWidget(widget, list[index].Id, sortOrder);
            return list;
        }, cancellationToken);

    public Task<DashboardReadResult> DeleteWidgetAsync(
        Guid dashboardId, Guid widgetId, Guid userId, CancellationToken cancellationToken) =>
        MutateWidgetsAsync(dashboardId, userId, current =>
        {
            var list = current
                .Where(stored => !string.Equals(stored.Id, widgetId.ToString(), StringComparison.OrdinalIgnoreCase))
                .ToList();
            return list.Count == current.Count ? null : list; // Nothing removed → unknown id → NotFound.
        }, cancellationToken);

    // Read → seeded-guard → editor-guard → mutate the widget list in-process → persist via
    // usp_UpdateDashboard → recompose. The mutate delegate returns null when the widget id is unknown.
    private async Task<DashboardReadResult> MutateWidgetsAsync(
        Guid dashboardId,
        Guid userId,
        Func<IReadOnlyList<StoredWidget>, List<StoredWidget>?> mutate,
        CancellationToken cancellationToken)
    {
        var dash = await ReadDashboardAsync(dashboardId, cancellationToken).ConfigureAwait(false);
        if (dash is null)
        {
            return new DashboardReadResult(DashboardOutcome.NotFound);
        }

        if (dash.IsSeeded)
        {
            return new DashboardReadResult(DashboardOutcome.SeededReadOnly);
        }

        if (!await CanEditAsync(dash, userId, cancellationToken).ConfigureAwait(false))
        {
            return new DashboardReadResult(DashboardOutcome.Denied);
        }

        var current = ParseWidgets(dash.WidgetsJson);
        var mutated = mutate(current);
        if (mutated is null)
        {
            return new DashboardReadResult(DashboardOutcome.NotFound);
        }

        var widgetsJson = JsonSerializer.Serialize(mutated, WidgetWriteOptions);
        await _db.Database.ExecuteSqlRawAsync(
            "EXEC dbo.usp_UpdateDashboard @SavedDashboardId, @Name, @AudienceJson, @Retire, @Visibility, @WidgetsJson, @ActorUserId",
            new[]
            {
                new SqlParameter("@SavedDashboardId", dashboardId),
                new SqlParameter("@Name", DBNull.Value),
                new SqlParameter("@AudienceJson", DBNull.Value),
                new SqlParameter("@Retire", false),
                new SqlParameter("@Visibility", DBNull.Value),
                new SqlParameter("@WidgetsJson", widgetsJson),
                new SqlParameter("@ActorUserId", userId.ToString()),
            },
            cancellationToken).ConfigureAwait(false);

        return await ReadComposedResultAsync(dashboardId, cancellationToken).ConfigureAwait(false);
    }

    // Re-read a dashboard after a write and recompose it for the caller (drill off — a write response
    // is not a drill context). A row that vanished mid-write returns a bare Success.
    private async Task<DashboardReadResult> ReadComposedResultAsync(Guid dashboardId, CancellationToken cancellationToken)
    {
        var updated = await ReadDashboardAsync(dashboardId, cancellationToken).ConfigureAwait(false);
        if (updated is null)
        {
            return new DashboardReadResult(DashboardOutcome.Success);
        }

        var response = await ComposeAsync(updated, updated.SupportsDrillThrough, drillJson: null, cancellationToken).ConfigureAwait(false);
        return new DashboardReadResult(DashboardOutcome.Success, response);
    }

    // A caller may edit a Personal dashboard only if they authored it; a Shared (or any non-Personal)
    // dashboard requires WorkspaceAdmin. Seeded dashboards are handled by the caller before this.
    private async Task<bool> CanEditAsync(DashboardRow dash, Guid userId, CancellationToken cancellationToken)
    {
        if (IsPersonal(dash))
        {
            return IsAuthor(dash, userId);
        }

        return await _accessGuard
            .HasWorkspaceLevelAsync(userId, dash.WorkspaceId, WorkspaceLevel.WorkspaceAdmin, cancellationToken)
            .ConfigureAwait(false);
    }

    private static bool IsPersonal(DashboardRow dash) =>
        string.Equals(dash.Visibility, "Personal", StringComparison.OrdinalIgnoreCase);

    private static bool IsAuthor(DashboardRow dash, Guid userId) =>
        string.Equals(dash.CreatedBy, userId.ToString(), StringComparison.OrdinalIgnoreCase);

    private static string SerializeWidgets(IEnumerable<WidgetComposeRequest> widgets)
    {
        var stored = widgets
            .Select((widget, index) => ToStoredWidget(
                widget,
                string.IsNullOrWhiteSpace(widget.Id) ? Guid.NewGuid().ToString() : widget.Id!,
                widget.SortOrder))
            .ToList();
        return JsonSerializer.Serialize(stored, WidgetWriteOptions);
    }

    private static StoredWidget ToStoredWidget(WidgetComposeRequest request, string id, int sortOrder) =>
        new(
            id,
            request.Type ?? "kpi-tile",
            request.Title ?? string.Empty,
            new StoredWidgetConfig(
                Metric: null,
                ObjectType: null,
                SavedViewId: null,
                ComposedMetric: request.Metric,
                GroupByDimension: request.GroupByDimension,
                RowLimit: request.RowLimit,
                Width: request.Width ?? "Half",
                SortOrder: sortOrder,
                Depts: request.Depts,
                Stages: request.Stages));

    private async Task<SavedDashboardResponse> ComposeAsync(
        DashboardRow dash, bool supportsDrill, string? drillJson, CancellationToken cancellationToken)
    {
        var isComposed = string.Equals(dash.LayoutMode, "Composed", StringComparison.OrdinalIgnoreCase);
        var storedWidgets = ParseWidgets(dash.WidgetsJson);
        // Composed widgets render in sortOrder; fixed (seeded) widgets keep their authored array order.
        var ordered = isComposed
            ? storedWidgets.OrderBy(widget => widget.Config.SortOrder ?? 0).ToList()
            : storedWidgets;

        var widgets = new List<DashboardWidgetResponse>(ordered.Count);
        foreach (var widget in ordered)
        {
            var config = new DashboardWidgetConfigResponse(
                widget.Config.Metric,
                widget.Config.ObjectType,
                widget.Config.SavedViewId,
                widget.Config.ComposedMetric,
                widget.Config.GroupByDimension,
                widget.Config.RowLimit,
                widget.Config.Width,
                widget.Config.SortOrder,
                widget.Config.Depts,
                widget.Config.Stages);
            var data = isComposed
                ? await _resolver.ResolveComposedAsync(dash.WorkspaceId, widget.Type, config, cancellationToken).ConfigureAwait(false)
                : await _resolver.ResolveAsync(dash.WorkspaceId, config, drillJson, cancellationToken).ConfigureAwait(false);
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
            Widgets: widgets,
            IsSeeded: dash.IsSeeded,
            Visibility: dash.Visibility,
            LayoutMode: dash.LayoutMode);
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

    // The stored widget shape on the SavedDashboard row (WidgetsJson). Deserialized/serialized with
    // Web defaults so camelCase keys bind directly. Fixed (seeded) widgets carry metric/objectType/
    // savedViewId; composed widgets (slice 28) carry composedMetric/groupByDimension/rowLimit/width/
    // sortOrder/depts/stages. WidgetWriteOptions omits null members so each shape stays clean on the row.
    private static readonly JsonSerializerOptions WidgetWriteOptions =
        new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    private sealed record StoredWidget(string Id, string Type, string Title, StoredWidgetConfig Config)
    {
        public StoredWidget() : this(string.Empty, string.Empty, string.Empty, new StoredWidgetConfig())
        {
        }
    }

    private sealed record StoredWidgetConfig(
        string? Metric,
        string? ObjectType,
        Guid? SavedViewId,
        string? ComposedMetric,
        string? GroupByDimension,
        int? RowLimit,
        string? Width,
        int? SortOrder,
        IReadOnlyList<string>? Depts,
        IReadOnlyList<string>? Stages)
    {
        public StoredWidgetConfig() : this(null, null, null, null, null, null, null, null, null, null)
        {
        }
    }
}

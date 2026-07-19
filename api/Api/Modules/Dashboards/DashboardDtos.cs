// Wire contracts for the Dashboards module (Slice 23 — api-contracts.md §15, BS §10.2-§10.5).
// Property names serialize to camelCase (ASP.NET Core web defaults) so they mirror the Dashboard
// types in /shared/types/dashboards.ts exactly. A dashboard never widens access — every widget
// result resolves to the caller's own entitlements (BS §10.2). `audience` rides as a raw JsonElement
// so the AudienceJson shape (AnnouncementAudience) passes through verbatim without re-modelling it
// here. Widget `data` is an open `object` narrowed on the wire by widget `type`; the resolver fills
// it with one of the strongly-typed shapes below.

using System.Text.Json;
using System.Text.Json.Serialization;

namespace McDermott.AiTracker.Api.Modules.Dashboards;

// ── Widget config + widget envelope ────────────────────────────────────────

/// <summary>The stored/echoed widget config (mirrors DashboardWidgetConfig). Fixed (seeded) widgets
/// carry <c>Metric</c> (+ <c>ObjectType</c>/<c>SavedViewId</c>); composed widgets carry the composed
/// vocabulary (<c>ComposedMetric</c>/<c>GroupByDimension</c>/<c>RowLimit</c>/scope/<c>Width</c>/
/// <c>SortOrder</c>). Null fields are omitted on the wire (WhenWritingNull) so each shape stays clean.</summary>
public sealed record DashboardWidgetConfigResponse(
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Metric,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? ObjectType,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Guid? SavedViewId,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? ComposedMetric = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? GroupByDimension = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? RowLimit = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Width = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? SortOrder = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] IReadOnlyList<string>? Depts = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] IReadOnlyList<string>? Stages = null);

/// <summary>One resolved widget (mirrors DashboardWidgetDto). <c>Data</c> is narrowed by <c>Type</c>.</summary>
public sealed record DashboardWidgetResponse(
    string Id,
    string Type,
    string Title,
    DashboardWidgetConfigResponse Config,
    object Data);

/// <summary>GET /dashboards/{id} — the full dashboard with every widget resolved (mirrors SavedDashboardDto).</summary>
public sealed record SavedDashboardResponse(
    Guid Id,
    Guid WorkspaceId,
    string? Slug,
    string Name,
    string? Description,
    JsonElement Audience,
    bool IsDefault,
    string ObjectType,
    bool SupportsDrillThrough,
    IReadOnlyList<DashboardWidgetResponse> Widgets,
    bool IsSeeded,
    string Visibility,
    string LayoutMode);

/// <summary>One row of the Dashboards list (mirrors DashboardListItemDto) — metadata only, no widget data.</summary>
public sealed record DashboardListItemResponse(
    Guid Id,
    Guid WorkspaceId,
    string? Slug,
    string Name,
    string? Description,
    JsonElement Audience,
    bool IsDefault,
    string ObjectType,
    int WidgetCount,
    DateTime UpdatedAt,
    bool IsSeeded,
    string Visibility,
    string LayoutMode);

/// <summary>GET /workspaces/{id}/dashboards (mirrors DashboardListDto).</summary>
public sealed record DashboardListResponse(
    Guid WorkspaceId,
    IReadOnlyList<DashboardListItemResponse> Items);

/// <summary>PATCH /dashboards/{id} — audience/name edit + retire (S32, WorkspaceAdmin) plus the
/// composer's visibility/layout edits (slice 28). Mirrors DashboardPatchRequest. <c>Visibility</c>
/// and <c>Widgets</c> are composer-path fields — rejected on a seeded dashboard (403).</summary>
public sealed class DashboardPatchRequest
{
    /// <summary>New name (optional; unchanged when null).</summary>
    public string? Name { get; set; }

    /// <summary>New audience (optional; unchanged when null). Shape = AnnouncementAudience.</summary>
    public JsonElement? Audience { get; set; }

    /// <summary>When true, soft-retire the dashboard (removes it from the list).</summary>
    public bool? Retire { get; set; }

    /// <summary>v2 (slice 28). Toggle Shared/Personal on a composed dashboard (composer path).</summary>
    public string? Visibility { get; set; }

    /// <summary>v2 (slice 28). Replace the composed dashboard's ordered widget list (reorder / bulk).</summary>
    public IReadOnlyList<WidgetComposeRequest>? Widgets { get; set; }
}

/// <summary>POST /workspaces/{id}/dashboards — create a user-composed dashboard (slice 28). Mirrors
/// DashboardComposeRequest.</summary>
public sealed class DashboardComposeRequest
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    /// <summary>'Shared' | 'Personal'.</summary>
    public string? Visibility { get; set; }
    /// <summary>'Request' | 'Feature' (R1 composer is Request-scoped; defaults to Request).</summary>
    public string? ObjectType { get; set; }
    /// <summary>Optional initial widget list (the composer usually adds widgets afterwards).</summary>
    public IReadOnlyList<WidgetComposeRequest>? Widgets { get; set; }
}

/// <summary>One composed widget (slice 28). Mirrors WidgetComposeRequest. Validated against the
/// composer's type → required-field schema in the service before persist.</summary>
public sealed class WidgetComposeRequest
{
    /// <summary>Present on a full-list replace; server-assigns on a bare POST.</summary>
    public string? Id { get; set; }
    public string? Type { get; set; }
    public string? Title { get; set; }
    /// <summary>kpi-tile — 'count' | 'unassigned' | 'overdue' | 'high-priority'.</summary>
    public string? Metric { get; set; }
    /// <summary>bar-breakdown / segmented-bar — 'origin' | 'stage' | 'analyst' | 'priority'.</summary>
    public string? GroupByDimension { get; set; }
    /// <summary>records-grid — max rows shown.</summary>
    public int? RowLimit { get; set; }
    /// <summary>'Half' | 'Full'.</summary>
    public string? Width { get; set; }
    /// <summary>Scope filter — dept/PG/client labels; empty = every department.</summary>
    public IReadOnlyList<string>? Depts { get; set; }
    /// <summary>Scope filter — stage keys; empty = every stage.</summary>
    public IReadOnlyList<string>? Stages { get; set; }
    /// <summary>Insertion order within the dashboard.</summary>
    public int SortOrder { get; set; }
}

// ── Widget result shapes (the `data` union, mirroring the TS shapes exactly) ─

/// <summary>One labelled magnitude in a bar / segmented / histogram widget (mirrors WidgetSegment).</summary>
public sealed record WidgetSegment(string Label, int Count, double Percent);

/// <summary>One labelled sub-count under a KPI (mirrors KpiBreakdownEntry).</summary>
public sealed record KpiBreakdownEntry(string Label, int Count);

/// <summary>A single KPI value with an optional caption + per-origin breakdown (mirrors KpiTileData).</summary>
public sealed record KpiTileData(
    int Value,
    string? Caption,
    IReadOnlyList<KpiBreakdownEntry>? Breakdown);

/// <summary>A KPI value with a signed trend vs the prior period (mirrors KpiTrendData).</summary>
public sealed record KpiTrendData(
    double Value,
    string? Unit,
    double Delta,
    string DeltaLabel,
    IReadOnlyList<KpiBreakdownEntry>? Breakdown);

/// <summary>A segmented bar — parts of a whole (mirrors SegmentedBarData).</summary>
public sealed record SegmentedBarData(int Total, IReadOnlyList<WidgetSegment> Segments);

/// <summary>A ranked bar breakdown (mirrors BarBreakdownData).</summary>
public sealed record BarBreakdownData(IReadOnlyList<WidgetSegment> Bars);

/// <summary>A histogram of buckets (mirrors HistogramData).</summary>
public sealed record HistogramData(IReadOnlyList<WidgetSegment> Buckets);

/// <summary>A heatmap column header, carrying its group label on the first column of each group (mirrors HeatmapColumn).</summary>
public sealed record HeatmapColumn(
    string Label,
    string? Group,
    bool? GroupStart);

/// <summary>One heatmap cell magnitude (mirrors HeatmapCell).</summary>
public sealed record HeatmapCell(int Count);

/// <summary>One heatmap row — a label plus a cell per column, in column order (mirrors HeatmapRow).</summary>
public sealed record HeatmapRow(string Label, IReadOnlyList<HeatmapCell> Cells);

/// <summary>A heatmap matrix (mirrors HeatmapMatrixData).</summary>
public sealed record HeatmapMatrixData(
    IReadOnlyList<HeatmapColumn> Columns,
    IReadOnlyList<HeatmapRow> Rows);

/// <summary>One records-grid row (mirrors DashboardGridRow). Feature grids reuse the same shape.</summary>
public sealed record DashboardGridRow(
    string Id,
    string Name,
    string Stage,
    string Origin,
    string Analyst,
    int Priority,
    string? Due,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? StatusCategory,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? Closed);

/// <summary>A resolved records-grid page — drill-through applied server-side when a drill is passed (mirrors RecordsGridData).</summary>
public sealed record RecordsGridData(
    string ObjectType,
    Guid? SavedViewId,
    IReadOnlyList<string> Columns,
    int Count,
    IReadOnlyList<DashboardGridRow> Rows);

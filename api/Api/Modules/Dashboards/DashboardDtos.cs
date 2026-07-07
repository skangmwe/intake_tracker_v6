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

/// <summary>The stored/echoed widget config (mirrors DashboardWidgetConfig).</summary>
public sealed record DashboardWidgetConfigResponse(
    string Metric,
    string? ObjectType,
    Guid? SavedViewId);

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
    string Slug,
    string Name,
    string? Description,
    JsonElement Audience,
    bool IsDefault,
    string ObjectType,
    bool SupportsDrillThrough,
    IReadOnlyList<DashboardWidgetResponse> Widgets);

/// <summary>One row of the Dashboards list (mirrors DashboardListItemDto) — metadata only, no widget data.</summary>
public sealed record DashboardListItemResponse(
    Guid Id,
    Guid WorkspaceId,
    string Slug,
    string Name,
    string? Description,
    JsonElement Audience,
    bool IsDefault,
    string ObjectType,
    int WidgetCount,
    DateTime UpdatedAt);

/// <summary>GET /workspaces/{id}/dashboards (mirrors DashboardListDto).</summary>
public sealed record DashboardListResponse(
    Guid WorkspaceId,
    IReadOnlyList<DashboardListItemResponse> Items);

/// <summary>PATCH /dashboards/{id} — audience edit / rename / retire (S32, WorkspaceAdmin). Mirrors DashboardPatchRequest.</summary>
public sealed class DashboardPatchRequest
{
    /// <summary>New name (optional; unchanged when null).</summary>
    public string? Name { get; set; }

    /// <summary>New audience (optional; unchanged when null). Shape = AnnouncementAudience.</summary>
    public JsonElement? Audience { get; set; }

    /// <summary>When true, soft-retire the dashboard (removes it from the list).</summary>
    public bool? Retire { get; set; }
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

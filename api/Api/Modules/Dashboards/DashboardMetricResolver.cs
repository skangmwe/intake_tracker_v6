// Dashboard metric resolver (Slice 23 — api-contracts.md §15, BS §10.2/§10.6). One method per seeded
// metric: it runs the metric's stored procedure (scoped to the workspace — the caller's access is
// already verified in DashboardsService) and shapes the widget `data` object to mirror the TS shape
// exactly (KpiTileData / KpiTrendData / SegmentedBarData / BarBreakdownData / HistogramData /
// HeatmapMatrixData / RecordsGridData). Fixed-order padding (categories / outcomes / aging buckets /
// heatmap columns) and the percent math live here — segmented percent = count/total*100; bar &
// histogram = count/max*100; both guard divide-by-zero → 0. An unknown metric resolves to an empty
// data object rather than throwing, so one bad widget never fails the whole dashboard (§10.6).

using System.Data;
using System.Data.Common;
using System.Text.Json;
using McDermott.AiTracker.Api.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace McDermott.AiTracker.Api.Modules.Dashboards;

public sealed class DashboardMetricResolver
{
    // Fixed category / outcome / bucket orders the widgets pad to (BS §10.2 — the layout is fixed).
    private static readonly string[] StatusCategories = { "Intake", "Execution", "Validation", "Delivery" };
    private static readonly string[] ClosureOutcomes = { "Live", "Declined", "Withdrawn", "Duplicate" };
    private static readonly string[] AgingBuckets = { "0–2", "3–7", "8–14", "15–30", "30+" };
    private const string UnsetOrigin = "— (unset)";
    private const int GridTop = 50;
    private const int TriageWindowDays = 30;

    private readonly AppDbContext _db;

    public DashboardMetricResolver(AppDbContext db)
    {
        _db = db;
    }

    /// <summary>Resolve one widget's <c>data</c> object. <paramref name="drillJson"/> is applied only by the
    /// records-grid metric and is passed as null by the caller when drill-through is suppressed (S16).</summary>
    public async Task<object> ResolveAsync(
        Guid workspaceId,
        DashboardWidgetConfigResponse config,
        string? drillJson,
        CancellationToken cancellationToken)
    {
        return config.Metric switch
        {
            "pipeline-by-category" => await PipelineByCategoryAsync(workspaceId, cancellationToken).ConfigureAwait(false),
            "escalations-by-quarter-origin" => await EscalationsByQuarterAsync(workspaceId, cancellationToken).ConfigureAwait(false),
            "unassigned-past-intake" => await UnassignedAsync(workspaceId, cancellationToken).ConfigureAwait(false),
            "closures-by-outcome" => await ClosuresByOutcomeAsync(workspaceId, cancellationToken).ConfigureAwait(false),
            "origin-by-status-heatmap" => await OriginStatusHeatmapAsync(workspaceId, cancellationToken).ConfigureAwait(false),
            "open-per-analyst" => await OpenPerAnalystAsync(workspaceId, cancellationToken).ConfigureAwait(false),
            "pending-signoff" => await PendingSignoffAsync(workspaceId, cancellationToken).ConfigureAwait(false),
            "median-time-to-triage" => await MedianTimeToTriageAsync(workspaceId, cancellationToken).ConfigureAwait(false),
            "aging-in-stage" => await AgingInStageAsync(workspaceId, cancellationToken).ConfigureAwait(false),
            "features-published" => await FeaturesPublishedAsync(workspaceId, cancellationToken).ConfigureAwait(false),
            "features-by-type" => await FeaturesByTypeAsync(workspaceId, cancellationToken).ConfigureAwait(false),
            "features-by-tech" => await FeaturesByTechAsync(workspaceId, cancellationToken).ConfigureAwait(false),
            "requests-by-origin" => await RequestsByOriginAsync(workspaceId, cancellationToken).ConfigureAwait(false),
            "escalation-status" => await EscalationStatusAsync(workspaceId, cancellationToken).ConfigureAwait(false),
            "records-grid" => await RecordsGridAsync(workspaceId, config, drillJson, cancellationToken).ConfigureAwait(false),
            _ => EmptyForUnknownMetric(),
        };
    }

    // ── Composed-dashboard resolution (slice 28) ───────────────────────────
    // User-composed dashboards do NOT use the fixed named metrics above. Each widget dispatches on
    // its widget TYPE and carries the composed vocabulary (composedMetric / groupByDimension /
    // rowLimit / dept + stage scope). One generic resolver per widget shape, over the scoped OPEN
    // records. An unknown/unsupported type resolves to an empty tile rather than failing the board.

    private const int ComposedGridDefaultTop = 6;

    /// <summary>Resolve one composed widget's <c>data</c> object by its widget type + composed config.</summary>
    public async Task<object> ResolveComposedAsync(
        Guid workspaceId,
        string widgetType,
        DashboardWidgetConfigResponse config,
        CancellationToken cancellationToken)
    {
        return widgetType switch
        {
            "kpi-tile" => await ComposedKpiAsync(workspaceId, config, cancellationToken).ConfigureAwait(false),
            "bar-breakdown" => await ComposedBreakdownAsync(workspaceId, config, segmented: false, cancellationToken).ConfigureAwait(false),
            "segmented-bar" => await ComposedBreakdownAsync(workspaceId, config, segmented: true, cancellationToken).ConfigureAwait(false),
            "records-grid" => await ComposedGridAsync(workspaceId, config, cancellationToken).ConfigureAwait(false),
            _ => EmptyForUnknownMetric(),
        };
    }

    private async Task<object> ComposedKpiAsync(
        Guid workspaceId, DashboardWidgetConfigResponse config, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<DashboardScalarCountRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetDashboardComposedKpi @WorkspaceId, @Metric, @DeptsJson, @StagesJson, @Today",
                WorkspaceParam(workspaceId),
                new SqlParameter("@Metric", (object?)(config.ComposedMetric ?? "count")),
                ScopeParam("@DeptsJson", config.Depts),
                ScopeParam("@StagesJson", config.Stages),
                new SqlParameter("@Today", DBNull.Value))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var value = rows.FirstOrDefault()?.Cnt ?? 0;
        return new KpiTileData(value, Caption: null, Breakdown: null);
    }

    private async Task<object> ComposedBreakdownAsync(
        Guid workspaceId, DashboardWidgetConfigResponse config, bool segmented, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<DashboardComposedBreakdownRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetDashboardComposedBreakdown @WorkspaceId, @GroupBy, @DeptsJson, @StagesJson",
                WorkspaceParam(workspaceId),
                new SqlParameter("@GroupBy", (object?)(config.GroupByDimension ?? "origin")),
                ScopeParam("@DeptsJson", config.Depts),
                ScopeParam("@StagesJson", config.Stages))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        if (segmented)
        {
            var total = rows.Sum(row => row.Cnt);
            var segments = rows
                .Select(row => new WidgetSegment(row.Label, row.Cnt, PercentOfTotal(row.Cnt, total)))
                .ToList();
            return new SegmentedBarData(total, segments);
        }

        var max = rows.Select(row => row.Cnt).DefaultIfEmpty(0).Max();
        var bars = rows
            .Select(row => new WidgetSegment(row.Label, row.Cnt, PercentOfMax(row.Cnt, max)))
            .ToList();
        return new BarBreakdownData(bars);
    }

    private async Task<object> ComposedGridAsync(
        Guid workspaceId, DashboardWidgetConfigResponse config, CancellationToken cancellationToken)
    {
        var top = config.RowLimit is > 0 and <= 100 ? config.RowLimit.Value : ComposedGridDefaultTop;
        var rows = new List<DashboardGridRow>();
        var total = 0;

        await ReadTwoResultSetsAsync(
            "EXEC dbo.usp_GetDashboardComposedGrid @WorkspaceId, @DeptsJson, @StagesJson, @Top",
            new[]
            {
                WorkspaceParam(workspaceId),
                ScopeParam("@DeptsJson", config.Depts),
                ScopeParam("@StagesJson", config.Stages),
                new SqlParameter("@Top", top),
            },
            reader =>
            {
                var idIndex = reader.GetOrdinal("Id");
                var nameIndex = reader.GetOrdinal("Name");
                var stageIndex = reader.GetOrdinal("Stage");
                var originIndex = reader.GetOrdinal("Origin");
                var analystIndex = reader.GetOrdinal("Analyst");
                var priorityIndex = reader.GetOrdinal("Priority");
                var dueIndex = reader.GetOrdinal("Due");
                var categoryIndex = reader.GetOrdinal("StatusCategory");

                rows.Add(new DashboardGridRow(
                    Id: GetStringOrEmpty(reader, idIndex),
                    Name: GetStringOrEmpty(reader, nameIndex),
                    Stage: GetStringOrEmpty(reader, stageIndex),
                    Origin: OriginOrUnset(GetStringOrNull(reader, originIndex)),
                    Analyst: GetStringOrEmpty(reader, analystIndex),
                    Priority: reader.IsDBNull(priorityIndex) ? 0 : reader.GetInt32(priorityIndex),
                    Due: GetDateOrNull(reader, dueIndex),
                    StatusCategory: GetStringOrNull(reader, categoryIndex),
                    Closed: false));
            },
            reader => total = reader.GetInt32(0),
            cancellationToken).ConfigureAwait(false);

        return new RecordsGridData(
            ObjectType: "Request",
            SavedViewId: null,
            Columns: new[] { "Name", "Stage", "Origin", "Analyst", "Priority", "Due" },
            Count: total,
            Rows: rows);
    }

    // Serialize a scope list to a JSON array parameter; null/empty → SQL NULL (= "no filter").
    private static SqlParameter ScopeParam(string name, IReadOnlyList<string>? values)
    {
        var hasValues = values is { Count: > 0 };
        return new SqlParameter(name, hasValues ? JsonSerializer.Serialize(values) : (object)DBNull.Value);
    }

    // ── Segmented / bar / histogram metrics ────────────────────────────────

    private async Task<object> PipelineByCategoryAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<DashboardCategoryCountRow>()
            .FromSqlRaw("EXEC dbo.usp_GetDashboardPipelineByCategory @WorkspaceId", WorkspaceParam(workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var counts = rows
            .GroupBy(row => row.Category)
            .ToDictionary(group => group.Key, group => group.Sum(row => row.Cnt), StringComparer.OrdinalIgnoreCase);
        var total = counts.Values.Sum();

        var segments = StatusCategories
            .Select(category =>
            {
                var count = counts.TryGetValue(category, out var value) ? value : 0;
                return new WidgetSegment(category, count, PercentOfTotal(count, total));
            })
            .ToList();

        return new SegmentedBarData(total, segments);
    }

    private async Task<object> ClosuresByOutcomeAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<DashboardOutcomeCountRow>()
            .FromSqlRaw("EXEC dbo.usp_GetDashboardClosuresByOutcome @WorkspaceId", WorkspaceParam(workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var counts = rows
            .GroupBy(row => row.Outcome)
            .ToDictionary(group => group.Key, group => group.Sum(row => row.Cnt), StringComparer.OrdinalIgnoreCase);
        var max = counts.Values.DefaultIfEmpty(0).Max();

        var bars = ClosureOutcomes
            .Select(outcome =>
            {
                var count = counts.TryGetValue(outcome, out var value) ? value : 0;
                return new WidgetSegment(outcome, count, PercentOfMax(count, max));
            })
            .ToList();

        return new BarBreakdownData(bars);
    }

    private async Task<object> OpenPerAnalystAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<DashboardAnalystCountRow>()
            .FromSqlRaw("EXEC dbo.usp_GetDashboardOpenPerAnalyst @WorkspaceId", WorkspaceParam(workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var max = rows.Select(row => row.Cnt).DefaultIfEmpty(0).Max();
        var bars = rows
            .Select(row => new WidgetSegment(row.Analyst, row.Cnt, PercentOfMax(row.Cnt, max)))
            .ToList();

        return new BarBreakdownData(bars);
    }

    private async Task<object> FeaturesByTypeAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<DashboardTypeCountRow>()
            .FromSqlRaw("EXEC dbo.usp_GetDashboardFeaturesByType @WorkspaceId", WorkspaceParam(workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var max = rows.Select(row => row.Cnt).DefaultIfEmpty(0).Max();
        var bars = rows
            .Select(row => new WidgetSegment(row.TypeLabel, row.Cnt, PercentOfMax(row.Cnt, max)))
            .ToList();

        return new BarBreakdownData(bars);
    }

    private async Task<object> FeaturesByTechAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<DashboardTechCountRow>()
            .FromSqlRaw("EXEC dbo.usp_GetDashboardFeaturesByTech @WorkspaceId", WorkspaceParam(workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var max = rows.Select(row => row.Cnt).DefaultIfEmpty(0).Max();
        var bars = rows
            .Select(row => new WidgetSegment(row.TechLabel, row.Cnt, PercentOfMax(row.Cnt, max)))
            .ToList();

        return new BarBreakdownData(bars);
    }

    private async Task<object> RequestsByOriginAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<DashboardOriginCountRow>()
            .FromSqlRaw("EXEC dbo.usp_GetDashboardRequestsByOrigin @WorkspaceId", WorkspaceParam(workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var max = rows.Select(row => row.Cnt).DefaultIfEmpty(0).Max();
        var bars = rows
            .Select(row => new WidgetSegment(OriginOrUnset(row.Origin), row.Cnt, PercentOfMax(row.Cnt, max)))
            .ToList();

        return new BarBreakdownData(bars);
    }

    private async Task<object> AgingInStageAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<DashboardAgingBucketRow>()
            .FromSqlRaw("EXEC dbo.usp_GetDashboardAgingInStage @WorkspaceId", WorkspaceParam(workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var counts = rows
            .GroupBy(row => row.Bucket)
            .ToDictionary(group => group.Key, group => group.Sum(row => row.Cnt), StringComparer.OrdinalIgnoreCase);
        var max = counts.Values.DefaultIfEmpty(0).Max();

        var buckets = AgingBuckets
            .Select(bucket =>
            {
                var count = counts.TryGetValue(bucket, out var value) ? value : 0;
                return new WidgetSegment(bucket, count, PercentOfMax(count, max));
            })
            .ToList();

        return new HistogramData(buckets);
    }

    // ── KPI tile / trend metrics ───────────────────────────────────────────

    private async Task<object> UnassignedAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<DashboardOriginCountRow>()
            .FromSqlRaw("EXEC dbo.usp_GetDashboardUnassigned @WorkspaceId", WorkspaceParam(workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var breakdown = rows
            .Select(row => new KpiBreakdownEntry(OriginOrUnset(row.Origin), row.Cnt))
            .ToList();
        var value = rows.Sum(row => row.Cnt);

        return new KpiTileData(value, Caption: null, Breakdown: breakdown);
    }

    private async Task<object> PendingSignoffAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
        var value = await ScalarCountAsync("EXEC dbo.usp_GetDashboardPendingSignoff @WorkspaceId", workspaceId, cancellationToken).ConfigureAwait(false);
        return new KpiTileData(value, Caption: null, Breakdown: null);
    }

    private async Task<object> FeaturesPublishedAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
        var value = await ScalarCountAsync("EXEC dbo.usp_GetDashboardFeaturesPublished @WorkspaceId", workspaceId, cancellationToken).ConfigureAwait(false);
        return new KpiTileData(value, Caption: null, Breakdown: null);
    }

    private async Task<object> EscalationStatusAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<DashboardEscalationStatusRow>()
            .FromSqlRaw("EXEC dbo.usp_GetDashboardEscalationStatus @WorkspaceId", WorkspaceParam(workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        var row = rows.FirstOrDefault() ?? new DashboardEscalationStatusRow();

        var breakdown = new List<KpiBreakdownEntry>
        {
            new("Set", row.SetCnt),
            new("Blank", row.BlankCnt),
        };
        return new KpiTileData(row.SetCnt, Caption: null, Breakdown: breakdown);
    }

    private async Task<object> EscalationsByQuarterAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<DashboardEscalationQuarterRow>()
            .FromSqlRaw("EXEC dbo.usp_GetDashboardEscalationsByQuarter @WorkspaceId", WorkspaceParam(workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var thisTotal = rows.Sum(row => row.ThisCnt);
        var priorTotal = rows.Sum(row => row.PriorCnt);
        var breakdown = rows
            .Where(row => row.ThisCnt > 0)
            .Select(row => new KpiBreakdownEntry(OriginOrUnset(row.Origin), row.ThisCnt))
            .ToList();

        return new KpiTrendData(
            Value: thisTotal,
            Unit: null,
            Delta: thisTotal - priorTotal,
            DeltaLabel: "vs prior quarter",
            Breakdown: breakdown);
    }

    private async Task<object> MedianTimeToTriageAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<DashboardMedianTriageRow>()
            .FromSqlRaw(
                "EXEC dbo.usp_GetDashboardMedianTimeToTriage @WorkspaceId, @WindowDays",
                WorkspaceParam(workspaceId),
                new SqlParameter("@WindowDays", TriageWindowDays))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        var row = rows.FirstOrDefault() ?? new DashboardMedianTriageRow();

        var value = row.MedianDays ?? 0d;
        var prior = row.PriorMedianDays ?? 0d;

        return new KpiTrendData(
            Value: value,
            Unit: "days",
            Delta: value - prior,
            DeltaLabel: $"vs prior {TriageWindowDays} days",
            Breakdown: null);
    }

    // ── Heatmap metric ─────────────────────────────────────────────────────

    private async Task<object> OriginStatusHeatmapAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<DashboardHeatmapCellRow>()
            .FromSqlRaw("EXEC dbo.usp_GetDashboardOriginStatusHeatmap @WorkspaceId", WorkspaceParam(workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var columnKeys = StatusCategories.Concat(ClosureOutcomes).ToList();
        var columns = new List<HeatmapColumn>();
        for (var columnIndex = 0; columnIndex < columnKeys.Count; columnIndex++)
        {
            var isClosedGroup = columnIndex >= StatusCategories.Length;
            var group = columnIndex == 0 ? "In flight" : columnIndex == StatusCategories.Length ? "Closed" : null;
            var groupStart = columnIndex == StatusCategories.Length ? true : (bool?)null;
            columns.Add(new HeatmapColumn(columnKeys[columnIndex], group, groupStart));
        }

        // Origin rows in first-seen order, then '— (unset)' always last.
        var lookup = new Dictionary<string, Dictionary<string, int>>(StringComparer.Ordinal);
        var originOrder = new List<string>();
        foreach (var row in rows)
        {
            var origin = OriginOrUnset(row.Origin);
            if (!lookup.TryGetValue(origin, out var cells))
            {
                cells = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                lookup[origin] = cells;
                originOrder.Add(origin);
            }

            cells[row.ColKey] = cells.TryGetValue(row.ColKey, out var existing) ? existing + row.Cnt : row.Cnt;
        }

        var orderedOrigins = originOrder
            .Where(origin => !string.Equals(origin, UnsetOrigin, StringComparison.Ordinal))
            .ToList();
        if (lookup.ContainsKey(UnsetOrigin))
        {
            orderedOrigins.Add(UnsetOrigin);
        }

        var heatmapRows = orderedOrigins
            .Select(origin =>
            {
                var cells = lookup[origin];
                var cellList = columnKeys
                    .Select(key => new HeatmapCell(cells.TryGetValue(key, out var count) ? count : 0))
                    .ToList();
                return new HeatmapRow(origin, cellList);
            })
            .ToList();

        return new HeatmapMatrixData(columns, heatmapRows);
    }

    // ── Records grid (two-result-set procs — raw ADO) ──────────────────────

    private async Task<object> RecordsGridAsync(
        Guid workspaceId, DashboardWidgetConfigResponse config, string? drillJson, CancellationToken cancellationToken)
    {
        var isFeature = string.Equals(config.ObjectType, "Feature", StringComparison.OrdinalIgnoreCase);
        return isFeature
            ? await FeatureGridAsync(workspaceId, config.SavedViewId, cancellationToken).ConfigureAwait(false)
            : await RequestGridAsync(workspaceId, config.SavedViewId, drillJson, cancellationToken).ConfigureAwait(false);
    }

    private async Task<RecordsGridData> RequestGridAsync(
        Guid workspaceId, Guid? savedViewId, string? drillJson, CancellationToken cancellationToken)
    {
        var rows = new List<DashboardGridRow>();
        var total = 0;

        await ReadTwoResultSetsAsync(
            "EXEC dbo.usp_GetDashboardRecordsGrid @WorkspaceId, @DrillJson, @Top",
            new[]
            {
                WorkspaceParam(workspaceId),
                new SqlParameter("@DrillJson", (object?)drillJson ?? DBNull.Value),
                new SqlParameter("@Top", GridTop),
            },
            reader =>
            {
                var idIndex = reader.GetOrdinal("Id");
                var nameIndex = reader.GetOrdinal("Name");
                var stageIndex = reader.GetOrdinal("Stage");
                var originIndex = reader.GetOrdinal("Origin");
                var analystIndex = reader.GetOrdinal("Analyst");
                var priorityIndex = reader.GetOrdinal("Priority");
                var dueIndex = reader.GetOrdinal("Due");
                var categoryIndex = reader.GetOrdinal("StatusCategory");
                var closedIndex = reader.GetOrdinal("Closed");

                rows.Add(new DashboardGridRow(
                    Id: GetStringOrEmpty(reader, idIndex),
                    Name: GetStringOrEmpty(reader, nameIndex),
                    Stage: GetStringOrEmpty(reader, stageIndex),
                    Origin: OriginOrUnset(GetStringOrNull(reader, originIndex)),
                    Analyst: GetStringOrEmpty(reader, analystIndex),
                    Priority: reader.IsDBNull(priorityIndex) ? 0 : reader.GetInt32(priorityIndex),
                    Due: GetDateOrNull(reader, dueIndex),
                    StatusCategory: GetStringOrNull(reader, categoryIndex),
                    Closed: reader.IsDBNull(closedIndex) ? null : reader.GetBoolean(closedIndex)));
            },
            reader => total = reader.GetInt32(0),
            cancellationToken).ConfigureAwait(false);

        return new RecordsGridData(
            ObjectType: "Request",
            SavedViewId: savedViewId,
            Columns: new[] { "Name", "Stage", "Origin", "Analyst", "Priority", "Due" },
            Count: total,
            Rows: rows);
    }

    private async Task<RecordsGridData> FeatureGridAsync(
        Guid workspaceId, Guid? savedViewId, CancellationToken cancellationToken)
    {
        var rows = new List<DashboardGridRow>();
        var total = 0;

        await ReadTwoResultSetsAsync(
            "EXEC dbo.usp_GetDashboardFeatureGrid @WorkspaceId, @Top",
            new[]
            {
                WorkspaceParam(workspaceId),
                new SqlParameter("@Top", GridTop),
            },
            reader =>
            {
                // Feature fields are mapped onto the shared DashboardGridRow slots (see Divergences):
                // Stage←Maturity, Origin←FeatureType, Analyst←Owner. Tech has no row slot in the frozen
                // shape and is surfaced by the features-by-tech widget instead.
                var idIndex = reader.GetOrdinal("Id");
                var nameIndex = reader.GetOrdinal("Name");
                var typeIndex = reader.GetOrdinal("FeatureType");
                var ownerIndex = reader.GetOrdinal("Owner");
                var maturityIndex = reader.GetOrdinal("Maturity");

                rows.Add(new DashboardGridRow(
                    Id: GetStringOrEmpty(reader, idIndex),
                    Name: GetStringOrEmpty(reader, nameIndex),
                    Stage: GetStringOrEmpty(reader, maturityIndex),
                    Origin: GetStringOrEmpty(reader, typeIndex),
                    Analyst: GetStringOrEmpty(reader, ownerIndex),
                    Priority: 0,
                    Due: null,
                    StatusCategory: null,
                    Closed: null));
            },
            reader => total = reader.GetInt32(0),
            cancellationToken).ConfigureAwait(false);

        return new RecordsGridData(
            ObjectType: "Feature",
            SavedViewId: savedViewId,
            Columns: new[] { "Name", "Type", "Owner", "Maturity" },
            Count: total,
            Rows: rows);
    }

    // ── Raw-ADO helpers (mirrors HomeService.ReadActivityAsync) ────────────

    private async Task ReadTwoResultSetsAsync(
        string commandText,
        SqlParameter[] parameters,
        Action<DbDataReader> readFirst,
        Action<DbDataReader> readSecond,
        CancellationToken cancellationToken)
    {
        var connection = _db.Database.GetDbConnection();
        var mustClose = connection.State != ConnectionState.Open;
        if (mustClose)
        {
            await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
        }

        try
        {
            using var command = connection.CreateCommand();
            command.CommandText = commandText;
            foreach (var parameter in parameters)
            {
                command.Parameters.Add(parameter);
            }

            await using var reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
            while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                readFirst(reader);
            }

            if (await reader.NextResultAsync(cancellationToken).ConfigureAwait(false))
            {
                while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
                {
                    readSecond(reader);
                }
            }
        }
        finally
        {
            if (mustClose)
            {
                await connection.CloseAsync().ConfigureAwait(false);
            }
        }
    }

    private async Task<int> ScalarCountAsync(string commandText, Guid workspaceId, CancellationToken cancellationToken)
    {
        var rows = await _db.Set<DashboardScalarCountRow>()
            .FromSqlRaw(commandText, WorkspaceParam(workspaceId))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return rows.FirstOrDefault()?.Cnt ?? 0;
    }

    // ── Small pure helpers ─────────────────────────────────────────────────

    private static SqlParameter WorkspaceParam(Guid workspaceId) => new("@WorkspaceId", workspaceId);

    private static double PercentOfTotal(int count, int total) => total <= 0 ? 0d : (double)count / total * 100d;

    private static double PercentOfMax(int count, int max) => max <= 0 ? 0d : (double)count / max * 100d;

    private static string OriginOrUnset(string? origin) =>
        string.IsNullOrWhiteSpace(origin) ? UnsetOrigin : origin;

    private static string GetStringOrEmpty(DbDataReader reader, int index) =>
        reader.IsDBNull(index) ? string.Empty : reader.GetString(index);

    private static string? GetStringOrNull(DbDataReader reader, int index) =>
        reader.IsDBNull(index) ? null : reader.GetString(index);

    private static string? GetDateOrNull(DbDataReader reader, int index) =>
        reader.IsDBNull(index) ? null : reader.GetDateTime(index).ToString("yyyy-MM-dd");

    // An unknown metric resolves to an empty tile rather than throwing (BS §10.6).
    private static object EmptyForUnknownMetric() => new KpiTileData(0, Caption: null, Breakdown: null);
}

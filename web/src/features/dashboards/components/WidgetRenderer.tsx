// Maps a widget's `type` to its renderer. The one place the widget palette is switched — adding a
// widget type is a single case here plus its component. An unknown type renders nothing (the API
// resolves unknown metrics to empty data; a genuinely unknown *type* is a no-op rather than a crash).

import type { WidgetProps } from './widgets/types';
import { BarBreakdownWidget } from './widgets/BarBreakdownWidget';
import { HeatmapWidget } from './widgets/HeatmapWidget';
import { HistogramWidget } from './widgets/HistogramWidget';
import { KpiTileWidget } from './widgets/KpiTileWidget';
import { KpiTrendWidget } from './widgets/KpiTrendWidget';
import { RecordsGridWidget } from './widgets/RecordsGridWidget';
import { SegmentedBarWidget } from './widgets/SegmentedBarWidget';

export function WidgetRenderer(props: WidgetProps) {
  switch (props.widget.type) {
    case 'kpi-tile':
      return <KpiTileWidget {...props} />;
    case 'kpi-with-trend':
      return <KpiTrendWidget {...props} />;
    case 'segmented-bar':
      return <SegmentedBarWidget {...props} />;
    case 'bar-breakdown':
      return <BarBreakdownWidget {...props} />;
    case 'histogram':
      return <HistogramWidget {...props} />;
    case 'heatmap-matrix':
      return <HeatmapWidget {...props} />;
    case 'records-grid':
      return <RecordsGridWidget {...props} />;
    case 'line-timeseries':
    default:
      // No line-timeseries widget ships in R1 (no metric points at it); unknown types are a no-op.
      return null;
  }
}

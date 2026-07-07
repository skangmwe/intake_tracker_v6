// The generic dashboard surface — renders any dashboard's widget list into the prototype's layout:
// consecutive KPI / chart tiles flow into a 4-up `.dash-row`; a heatmap or records-grid breaks out to
// full width. S6 (ai-default) is this surface with the seeded data; S14/S12/S15 reuse it unchanged; the
// S16 bound viewer renders it with drill-through suppressed (dashboard.supportsDrillThrough === false).
// The page owns the drill state and supplies the heading block.

import { Fragment, type ReactNode } from 'react';

import type {
  DashboardDrillFilter,
  DashboardWidgetDto,
  SavedDashboardDto,
  WidgetType,
} from '@shared/types';

import { WidgetRenderer } from './WidgetRenderer';

const FULL_WIDTH_TYPES: ReadonlySet<WidgetType> = new Set([
  'heatmap-matrix',
  'records-grid',
  'line-timeseries',
]);

interface DashboardSurfaceProps {
  dashboard: SavedDashboardDto;
  /** The heading / pin / subtitle block, composed by the page. */
  header: ReactNode;
  drill?: DashboardDrillFilter | undefined;
  onDrill?: ((filter: DashboardDrillFilter) => void) | undefined;
  onClearDrill?: (() => void) | undefined;
}

/** Split the widget list into render blocks: runs of tiles vs single full-width widgets. */
function toBlocks(widgets: DashboardWidgetDto[]): DashboardWidgetDto[][] {
  const blocks: DashboardWidgetDto[][] = [];
  let tiles: DashboardWidgetDto[] = [];
  for (const widget of widgets) {
    if (FULL_WIDTH_TYPES.has(widget.type)) {
      if (tiles.length > 0) {
        blocks.push(tiles);
        tiles = [];
      }
      blocks.push([widget]);
    } else {
      tiles.push(widget);
    }
  }
  if (tiles.length > 0) blocks.push(tiles);
  return blocks;
}

export function DashboardSurface({
  dashboard,
  header,
  drill,
  onDrill,
  onClearDrill,
}: DashboardSurfaceProps) {
  const drillEnabled = dashboard.supportsDrillThrough && Boolean(onDrill);
  const blocks = toBlocks(dashboard.widgets);

  return (
    <section className="dash" aria-labelledby="dash-heading">
      {header}

      {blocks.map((block, index) => {
        const widgetProps = (widget: DashboardWidgetDto) => ({
          widget,
          objectType: dashboard.objectType,
          drill,
          onDrill: drillEnabled ? onDrill : undefined,
          onClearDrill,
        });
        const [first] = block;
        const isFullWidth = block.length === 1 && first !== undefined && FULL_WIDTH_TYPES.has(first.type);
        return (
          <Fragment key={block.map((widget) => widget.id).join('-') || index}>
            {isFullWidth && first ? (
              <WidgetRenderer {...widgetProps(first)} />
            ) : (
              <div className="dash-row">
                {block.map((widget) => (
                  <WidgetRenderer key={widget.id} {...widgetProps(widget)} />
                ))}
              </div>
            )}
          </Fragment>
        );
      })}
    </section>
  );
}

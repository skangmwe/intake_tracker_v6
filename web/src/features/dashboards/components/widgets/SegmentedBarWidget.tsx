// Segmented-bar tile (S6 "Inflight status"). A single 26px bar split into 4 accent-ramp segments over
// the status categories, with a 2-column legend below. Each segment / legend row drills the records
// grid to that status category. Bar widths come from the API (segment.percent).

import { segmentColor } from './colors';
import { WidgetEyebrow } from './WidgetEyebrow';
import { metricIcon } from './metricIcons';
import { widgetData } from '../../format';
import type { WidgetProps } from './types';
import type { SegmentedBarData } from '@shared/types';

export function SegmentedBarWidget({ widget, onDrill }: WidgetProps) {
  const data = widgetData<SegmentedBarData>(widget);
  const segments = data.segments ?? [];
  const drill = (label: string) => onDrill?.({ type: 'category', value: label });

  return (
    <section className="mws-card dash-tile" data-ds="card">
      <WidgetEyebrow title={widget.title} icon={metricIcon(widget.config.metric)} />

      <div className="dash-seg" role="presentation">
        {segments.map((segment, index) => {
          const title = `${segment.label} · ${segment.count} record${segment.count === 1 ? '' : 's'}`;
          return (
            <button
              key={segment.label}
              type="button"
              className="dash-seg__bar"
              style={{ width: `${segment.percent}%`, background: segmentColor(index) }}
              title={title}
              aria-label={title}
              disabled={!onDrill}
              onClick={() => drill(segment.label)}
            />
          );
        })}
      </div>

      <div className="dash-seg__legend">
        {segments.map((segment, index) => (
          <button
            key={segment.label}
            type="button"
            className="dash-legend-row"
            disabled={!onDrill}
            onClick={() => drill(segment.label)}
          >
            <span className="dash-legend-row__swatch" style={{ background: segmentColor(index) }} />
            <span className="dash-legend-row__label">{segment.label}</span>
            <span className="dash-legend-row__count">{segment.count}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

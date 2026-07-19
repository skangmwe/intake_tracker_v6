// Histogram tile (S14 "Aging in stage") — open records bucketed by days-in-stage into ordered buckets
// (0–2, 3–7, …, 30+). Vertical columns whose height is the bucket's share of the max (bucket.percent).
// Distribution only — no drill target exists in the filter union, so columns are non-interactive.

import { widgetData } from '../../format';
import { WidgetEyebrow } from './WidgetEyebrow';
import { metricIcon } from './metricIcons';
import type { WidgetProps } from './types';
import type { HistogramData } from '@shared/types';

export function HistogramWidget({ widget }: WidgetProps) {
  const data = widgetData<HistogramData>(widget);
  const buckets = data.buckets ?? [];

  return (
    <section className="mws-card dash-tile" data-ds="card">
      <WidgetEyebrow title={widget.title} icon={metricIcon(widget.config.metric)} />

      <div className="dash-histogram" role="img" aria-label={widget.title}>
        {buckets.map((bucket) => (
          <div key={bucket.label} className="dash-histogram__col">
            <span className="dash-histogram__count">{bucket.count}</span>
            <span
              className="dash-histogram__bar"
              style={{ height: `${Math.max(bucket.percent, bucket.count > 0 ? 4 : 0)}%` }}
            />
            <span className="dash-histogram__label">{bucket.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// Horizontal bar-breakdown tile (S6 "Closures"; S14 "Open per analyst"; S12 "Features by type / tech";
// S15 "Requests by origin"). Each row is label · bar · count; bar widths come from the API
// (bar.percent, share of the max). Closures use the outcome palette and drill by outcome; requests-by-
// origin drills by origin; the remaining metrics are single-accent and non-drillable.

import { outcomeColor } from './colors';
import { widgetData } from '../../format';
import { WidgetEyebrow } from './WidgetEyebrow';
import { metricIcon } from './metricIcons';
import type { WidgetProps } from './types';
import type { BarBreakdownData, DashboardDrillFilter, DashboardMetric } from '@shared/types';

// `metric` is optional — composed bar-breakdown widgets (slice 28) carry no fixed metric, so these
// fall through to the single-accent, non-drillable defaults.
function barColor(metric: DashboardMetric | undefined, label: string): string {
  return metric === 'closures-by-outcome' ? outcomeColor(label) : 'var(--accent-interactive)';
}

function drillFor(metric: DashboardMetric | undefined, label: string): DashboardDrillFilter | null {
  if (metric === 'closures-by-outcome') return { type: 'outcome', value: label };
  if (metric === 'requests-by-origin') return { type: 'origin', value: label };
  return null;
}

export function BarBreakdownWidget({ widget, onDrill }: WidgetProps) {
  const data = widgetData<BarBreakdownData>(widget);
  const bars = data.bars ?? [];
  const metric = widget.config.metric;

  return (
    <section className="mws-card dash-tile" data-ds="card">
      <WidgetEyebrow title={widget.title} icon={metricIcon(metric)} />

      <div className="dash-bars">
        {bars.map((bar) => {
          const target = drillFor(metric, bar.label);
          const canDrill = Boolean(onDrill) && target !== null;
          return (
            <button
              key={bar.label}
              type="button"
              className="dash-bar-row"
              disabled={!canDrill}
              onClick={() => target && onDrill?.(target)}
            >
              <span className="dash-bar-row__label">{bar.label}</span>
              <span className="dash-bar-row__track">
                <span
                  className="dash-bar-row__fill"
                  style={{ width: `${bar.percent}%`, background: barColor(metric, bar.label) }}
                />
                <span className="dash-bar-row__count">{bar.count}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

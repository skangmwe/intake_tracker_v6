// KPI tile — a single 40px mono number with an optional caption and per-origin breakdown chips
// (S6 "Unassigned past Intake"; S14 "Unassigned" / "Pending sign-off"; S12 "Published"; S15). Only the
// unassigned metric is drillable (number + chips → drill the grid to unassigned-past-Intake); every
// other KPI is a static figure.

import { widgetData } from '../../format';
import { WidgetEyebrow } from './WidgetEyebrow';
import { metricIcon } from './metricIcons';
import type { WidgetProps } from './types';
import type { KpiTileData } from '@shared/types';

export function KpiTileWidget({ widget, onDrill }: WidgetProps) {
  const data = widgetData<KpiTileData>(widget);
  const isUnassigned = widget.config.metric === 'unassigned-past-intake';
  const drillable = Boolean(onDrill) && isUnassigned;
  const drill = () => onDrill?.({ type: 'unassigned' });
  const breakdown = data.breakdown ?? [];

  return (
    <section className="mws-card dash-tile" data-ds="card">
      <WidgetEyebrow title={widget.title} icon={metricIcon(widget.config.metric)} />

      {drillable ? (
        <button
          type="button"
          className="dash-kpi__value dash-kpi__value--drill"
          title="Show unassigned records in the grid"
          aria-label="Show unassigned records in the grid"
          onClick={drill}
        >
          {data.value}
        </button>
      ) : (
        <span className="dash-kpi__value">{data.value}</span>
      )}

      {data.caption && <span className="dash-kpi__caption">{data.caption}</span>}

      {breakdown.length > 0 && (
        <div className="dash-chips">
          {breakdown.map((entry) =>
            drillable ? (
              <button
                key={entry.label}
                type="button"
                className="dash-chip"
                title={`Show unassigned ${entry.label} records in the grid`}
                aria-label={`Show unassigned ${entry.label} records in the grid`}
                onClick={drill}
              >
                {entry.label}
                <span className="dash-chip__count">{entry.count}</span>
              </button>
            ) : (
              <span key={entry.label} className="dash-chip dash-chip--static">
                {entry.label}
                <span className="dash-chip__count">{entry.count}</span>
              </span>
            ),
          )}
        </div>
      )}
    </section>
  );
}

// KPI-with-trend tile — a 40px mono number, a signed delta vs the prior period, and optional
// per-origin chips (S6 "Escalations this quarter"; S14 "Median time-to-first-triage"). Escalation
// chips drill the grid to that origin; the triage variant carries no breakdown and no drill.

import { TrendDown, TrendUp } from '@phosphor-icons/react';

import { widgetData } from '../../format';
import { WidgetEyebrow } from './WidgetEyebrow';
import { metricIcon } from './metricIcons';
import type { WidgetProps } from './types';
import type { KpiTrendData } from '@shared/types';

export function KpiTrendWidget({ widget, onDrill }: WidgetProps) {
  const data = widgetData<KpiTrendData>(widget);
  const drillable = Boolean(onDrill) && widget.config.metric === 'escalations-by-quarter-origin';
  const breakdown = data.breakdown ?? [];
  const rising = data.delta >= 0;
  const TrendIcon = rising ? TrendUp : TrendDown;
  const deltaText = `${rising ? '+' : '−'}${Math.abs(data.delta)} ${data.deltaLabel}`;

  return (
    <section className="mws-card dash-tile" data-ds="card">
      <WidgetEyebrow title={widget.title} icon={metricIcon(widget.config.metric)} />

      <span className="dash-kpi__value">
        {data.value}
        {data.unit ? <span className="dash-kpi__unit"> {data.unit}</span> : null}
      </span>

      <span className="dash-kpi__trend">
        <TrendIcon size={14} weight="regular" aria-hidden />
        {deltaText}
      </span>

      {breakdown.length > 0 && (
        <div className="dash-chips">
          {breakdown.map((entry) =>
            drillable ? (
              <button
                key={entry.label}
                type="button"
                className="dash-chip"
                title={`Show open ${entry.label} records in the grid`}
                aria-label={`Show open ${entry.label} records in the grid`}
                onClick={() => onDrill?.({ type: 'origin', value: entry.label })}
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

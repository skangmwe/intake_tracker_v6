// Heatmap-matrix card (S6 "Requests by Dept/PG/Client × status"). A CSS grid of Dept/PG/Client rows ×
// the 7 in-flight status categories. Closed records (those with an outcome) are excluded here — the
// standalone "Closures by outcome" widget covers outcomes. In-flight cells ramp on pale-blue and drill
// by cell; empty cells render an em-dash. The closed-group rendering below stays as a defensive no-op
// (the API sends no closed columns). Cell counts come from the API; colour ramps are token-only here.

import { closedCellBg, cellForeground, inflightCellBg } from './colors';
import { cellCount, widgetData } from '../../format';
import type { WidgetProps } from './types';
import type { HeatmapMatrixData } from '@shared/types';

export function HeatmapWidget({ widget, onDrill }: WidgetProps) {
  const data = widgetData<HeatmapMatrixData>(widget);
  const columns = data.columns ?? [];
  const rows = data.rows ?? [];

  const closedStart = columns.findIndex((column) => column.groupStart);
  const inflightCount = closedStart === -1 ? columns.length : closedStart;
  const closedCount = columns.length - inflightCount;
  const isClosed = (index: number) => closedStart !== -1 && index >= closedStart;

  const gridStyle = { gridTemplateColumns: `130px repeat(${columns.length}, 1fr)` };

  return (
    <section className="mws-card dash-heatmap-card" data-ds="card">
      <span className="dash-tile__eyebrow dash-tile__eyebrow--plain">{widget.title}</span>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a horizontally-scrollable region must be keyboard-focusable so keyboard users can scroll it (axe scrollable-region-focusable). */}
      <div className="dash-heatmap-scroll" role="group" aria-label={widget.title} tabIndex={0}>
        <div className="dash-heatmap" style={gridStyle}>
          {/* Group-header row */}
          <span />
          {inflightCount > 0 && (
            <span className="dash-heatmap__group" style={{ gridColumn: `span ${inflightCount}` }}>
              In flight
            </span>
          )}
          {closedCount > 0 && (
            <span
              className="dash-heatmap__group dash-heatmap__group--closed"
              style={{ gridColumn: `span ${closedCount}` }}
            >
              Closed
            </span>
          )}

          {/* Column-header row */}
          <span />
          {columns.map((column, index) => (
            <span
              key={column.label}
              className={`dash-heatmap__col${index === closedStart ? ' dash-heatmap__col--divider' : ''}`}
            >
              {column.label}
            </span>
          ))}

          {/* Data rows */}
          {rows.map((row) => (
            <RowCells
              key={row.label}
              rowLabel={row.label}
              columns={columns}
              cells={row.cells}
              closedStart={closedStart}
              isClosed={isClosed}
              onDrill={onDrill}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

interface RowCellsProps {
  rowLabel: string;
  columns: HeatmapMatrixData['columns'];
  cells: HeatmapMatrixData['rows'][number]['cells'];
  closedStart: number;
  isClosed: (index: number) => boolean;
  onDrill: WidgetProps['onDrill'];
}

function RowCells({ rowLabel, columns, cells, closedStart, isClosed, onDrill }: RowCellsProps) {
  return (
    <>
      <span className="dash-heatmap__rowlabel">{rowLabel}</span>
      {columns.map((column, index) => {
        const count = cells[index]?.count ?? 0;
        const closed = isClosed(index);
        const title = closed
          ? `${rowLabel} × Closed · ${column.label} · ${count} record${count === 1 ? '' : 's'}`
          : `${rowLabel} × ${column.label} · ${count} record${count === 1 ? '' : 's'}`;
        const background = closed ? closedCellBg(column.label, count) : inflightCellBg(count);
        return (
          <button
            key={column.label}
            type="button"
            className={`dash-heatmap__cell${index === closedStart ? ' dash-heatmap__cell--divider' : ''}`}
            style={{ background, color: cellForeground(count, closed) }}
            title={title}
            aria-label={title}
            disabled={!onDrill}
            onClick={() =>
              onDrill?.(
                closed
                  ? { type: 'closedCell', origin: rowLabel, outcome: column.label }
                  : { type: 'cell', origin: rowLabel, category: column.label },
              )
            }
          >
            {cellCount(count)}
          </button>
        );
      })}
    </>
  );
}

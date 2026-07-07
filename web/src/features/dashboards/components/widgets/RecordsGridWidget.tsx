// Records-grid widget (S6 "All open requests"; S14/S15 "Records"; S12 "Catalog"). The embedded list at
// the foot of a dashboard: a header bar with the active drill-through pill, the row count, and an Export
// button, over the shared resizable items-grid (TableShell — reuses the S2 grid, so resize + sticky
// header + accessibility come for free). Drill-through is applied server-side; a closed record surfaced
// by an outcome/closed-cell drill is not openable. Columns/rows come from the API per viewer.

import { useNavigate } from 'react-router-dom';
import { DownloadSimple, X } from '@phosphor-icons/react';

import type { DashboardGridRow, RecordsGridData } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { TableShell, type TableColumn, type TableRow } from '@/shared/components/Table';
import { useExportView } from '@/features/import-export';

import { EM_DASH, drillLabel, formatDashDate, widgetData } from '../../format';
import type { WidgetProps } from './types';

// DashboardGridRow field order — the API emits `columns` in this same order, so column index i maps to
// FIELD_ORDER[i]. Feature grids send fewer columns; the extra fields are simply not rendered.
const FIELD_ORDER = ['id', 'name', 'stage', 'origin', 'analyst', 'priority', 'due'] as const;
const COLUMN_WIDTHS = [95, 230, 130, 140, 150, 80];

type GridField = (typeof FIELD_ORDER)[number];

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === '') return EM_DASH;
  return String(value);
}

function renderCell(field: GridField, row: DashboardGridRow) {
  switch (field) {
    case 'id':
      return <span className="dash-grid__mono">{cellText(row.id)}</span>;
    case 'name':
      return <span className="dash-grid__name">{cellText(row.name)}</span>;
    case 'priority':
      return <span className="dash-grid__mono dash-grid__num">{cellText(row.priority)}</span>;
    case 'due':
      return <span className="dash-grid__nowrap">{formatDashDate(row.due)}</span>;
    default:
      return cellText(row[field]);
  }
}

export function RecordsGridWidget({ widget, objectType, drill, onDrill, onClearDrill }: WidgetProps) {
  const navigate = useNavigate();
  const exportView = useExportView();
  const data = widgetData<RecordsGridData>(widget);
  const interactive = Boolean(onDrill);
  const gridObjectType = data.objectType ?? objectType;
  const savedViewId = data.savedViewId;

  const openRoute = (id: string) =>
    gridObjectType === 'Feature' ? `/feature-catalog/${id}` : `/requests/${id}`;

  const columns: TableColumn[] = data.columns.map((label, index) => {
    const field = FIELD_ORDER[index];
    return {
      key: field ?? `col-${index}`,
      label,
      width: COLUMN_WIDTHS[index],
      align: field === 'priority' ? 'right' : undefined,
    };
  });

  const fields = FIELD_ORDER.slice(0, data.columns.length);
  const rows: TableRow[] = data.rows.map((row) => ({
    id: row.id,
    onOpen: interactive && !row.closed ? () => navigate(openRoute(row.id)) : undefined,
    cells: fields.map((field) => renderCell(field, row)),
  }));

  const canExport = Boolean(savedViewId);
  const onExport = () => {
    if (savedViewId) exportView.mutate(savedViewId);
  };

  const countLabel = `${data.count} record${data.count === 1 ? '' : 's'}`;

  return (
    <section className="mws-card dash-grid-card" data-ds="card">
      <div className="dash-grid-card__bar">
        <span className="dash-tile__eyebrow dash-tile__eyebrow--plain">Records · {widget.title}</span>
        {drill && (
          <span className="dash-grid-card__pill">
            {drillLabel(drill)}
            <button
              type="button"
              className="dash-grid-card__pill-x"
              aria-label="Clear drill-through filter"
              onClick={onClearDrill}
            >
              <X size={12} weight="regular" aria-hidden />
            </button>
          </span>
        )}
        <span className="dash-grid-card__spacer" />
        <span className="dash-grid-card__count">{countLabel}</span>
        <Button
          variant="secondary"
          compact
          onClick={onExport}
          disabled={!canExport || exportView.isPending}
          title={canExport ? 'Export this view as CSV' : 'This dashboard grid has no saved view to export'}
        >
          <DownloadSimple size={16} weight="regular" aria-hidden />{' '}
          {exportView.isPending ? 'Exporting…' : 'Export view'}
        </Button>
      </div>

      {data.rows.length === 0 ? (
        <p className="dash-grid-card__empty">No records match this drill-through.</p>
      ) : (
        <div className="dash-grid-card__grid">
          <TableShell caption={`Records · ${widget.title}`} columns={columns} rows={rows} />
        </div>
      )}
    </section>
  );
}

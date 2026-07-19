// S43 Toolkit list view — the shared items-grid over the Toolkit rows. Columns mirror the prototype
// (minus "Times used", intentionally absent in R1 — usage-metrics.md is R2). Sortable + funnel-
// filterable headers are wired via the shared TableShell primitives; the row opens the detail sheet.

import type { ReactNode } from 'react';

import type { ToolkitItemListRow } from '@shared/types';

import {
  TableShell,
  type SortState,
  type TableColumn,
  type TableRow,
} from '@/shared/components/Table';

import { kindIcon, statusBadgeClass } from '../toolkitFormat';

const EM_DASH = '—';

export const TOOLKIT_COLUMNS: TableColumn[] = [
  { key: 'id', label: 'Record ID', width: 130, sortable: true },
  { key: 'name', label: 'Item', width: 220, sortable: true, filterable: true },
  { key: 'oneLiner', label: 'One-liner', width: 260 },
  { key: 'kind', label: 'Type', width: 120, sortable: true, filterable: true },
  { key: 'status', label: 'Status', width: 120, sortable: true, filterable: true },
  { key: 'maintainer', label: 'Maintainer', width: 160, sortable: true, filterable: true },
  { key: 'lastModifiedAt', label: 'Modified on', width: 120, sortable: true },
  { key: 'lastModifiedBy', label: 'Modified by', width: 150 },
];

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? iso
    : parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function toTableRow(row: ToolkitItemListRow, onOpen: () => void): TableRow {
  const Icon = kindIcon(row.kind);
  return {
    id: row.id,
    onOpen,
    cells: [
      <span key="id" className="tk-mono">
        {row.id}
      </span>,
      <span key="name" className="tk-list-name">
        <Icon size={18} weight="regular" aria-hidden />
        <span className="tk-list-name__text">{row.name}</span>
      </span>,
      <span key="oneLiner" className="tk-oneliner-cell">
        {row.oneLiner ?? EM_DASH}
      </span>,
      row.kind,
      <span key="status" className={`tk-badge ${statusBadgeClass(row.status)}`} data-ds="badge">
        {row.status}
      </span>,
      row.maintainer ?? EM_DASH,
      <span key="modified" className="tk-mono">
        {formatDate(row.lastModifiedAt)}
      </span>,
      row.lastModifiedBy || EM_DASH,
    ],
  };
}

interface ToolkitListProps {
  rows: ToolkitItemListRow[];
  sort: SortState | undefined;
  onSortChange: (sort: SortState | undefined) => void;
  renderFilter: (column: TableColumn) => ReactNode;
  onOpen: (id: ToolkitItemListRow['id']) => void;
}

export function ToolkitList({ rows, sort, onSortChange, renderFilter, onOpen }: ToolkitListProps) {
  return (
    <TableShell
      caption="Toolkit"
      columns={TOOLKIT_COLUMNS}
      rows={rows.map((row) => toTableRow(row, () => onOpen(row.id)))}
      sort={sort}
      onSortChange={onSortChange}
      renderFilter={renderFilter}
    />
  );
}

// The platform broadcast manage table — every broadcast (grouped across its per-workspace copies) on the
// shared TableShell so it reads like the workspace manage table: BROADCAST · POSTED BY · POSTED ·
// WORKSPACES · STATUS, with a text funnel on BROADCAST, click-to-sort on POSTED, and a StatusPill. The
// WORKSPACES cell shows how many workspaces the post fanned out to ("All" when it covers every one). A row
// click opens the editor.

import type { ReactNode } from 'react';
import { PushPin } from '@phosphor-icons/react';

import type { PlatformAnnouncementRow } from '@shared/types';

import {
  FilterFunnel,
  type FilterValue,
  type SortState,
  type TableColumn,
  TableShell,
} from '@/shared/components/Table';
import { StatusPill } from '@/shared/components/Feedback';
import { formatDateTime } from '@/shared/utils/dateFormat';

import { STATUS_PILL } from '../constants';
import type { AnnouncementsFilters } from '../announcementsView';

const EM_DASH = '—';

const COLUMNS: TableColumn[] = [
  { key: 'title', label: 'Broadcast', width: 260, filterable: true },
  { key: 'postedBy', label: 'Posted by', width: 160 },
  { key: 'posted', label: 'Posted', width: 150, sortable: true },
  { key: 'workspaces', label: 'Workspaces', width: 130 },
  { key: 'status', label: 'Status', width: 120, flex: true },
];

/** "5 Jul 2026, 09:31" — locale-aware date + time for the POSTED cell. */
function formatPosted(iso: string | undefined): string {
  if (!iso) return EM_DASH;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  return formatDateTime(date);
}

/** "All workspaces" when the broadcast covers every one, else "N workspaces". */
function formatWorkspaces(count: number, totalWorkspaces: number): string {
  if (totalWorkspaces > 0 && count >= totalWorkspaces) return 'All workspaces';
  return `${count} ${count === 1 ? 'workspace' : 'workspaces'}`;
}

interface PlatformBroadcastsTableProps {
  rows: PlatformAnnouncementRow[];
  totalWorkspaces: number;
  sort: SortState | undefined;
  onSortChange: (next: SortState | undefined) => void;
  filters: AnnouncementsFilters;
  onFilterChange: (value: FilterValue) => void;
  onOpen: (row: PlatformAnnouncementRow) => void;
}

export function PlatformBroadcastsTable({
  rows,
  totalWorkspaces,
  sort,
  onSortChange,
  filters,
  onFilterChange,
  onOpen,
}: PlatformBroadcastsTableProps) {
  const renderFilter = (column: TableColumn): ReactNode => {
    if (column.key !== 'title') return null;
    return (
      <FilterFunnel
        type="text"
        columnLabel={column.label}
        value={filters.title ?? { kind: 'text' }}
        onChange={onFilterChange}
      />
    );
  };

  const tableRows = rows.map((row) => {
    const pill = STATUS_PILL[row.status];
    return {
      id: row.broadcastId,
      onOpen: () => onOpen(row),
      cells: [
        <span key="title" className="ann-table__title">
          {row.pinned && (
            <PushPin size={14} weight="regular" className="ann-table__pin" aria-label="Pinned" />
          )}
          <span className="ann-table__title-text">{row.title}</span>
        </span>,
        row.authorName ? (
          row.authorName
        ) : (
          <span key="postedBy" className="ann-table__muted">
            {EM_DASH}
          </span>
        ),
        <span key="posted" className="ann-table__posted">
          {formatPosted(row.postedAt)}
        </span>,
        formatWorkspaces(row.workspaceCount, totalWorkspaces),
        <StatusPill key="status" status={pill.kind} label={pill.label} />,
      ],
    };
  });

  return (
    <div className="ann-boxed">
      <TableShell
        caption="Broadcasts across all workspaces"
        columns={COLUMNS}
        rows={tableRows}
        sort={sort}
        onSortChange={onSortChange}
        renderFilter={renderFilter}
      />
    </div>
  );
}

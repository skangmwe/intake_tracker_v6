// The S23 manage announcements table — the workspace's announcements on the shared TableShell so it
// reads like the Objects & Fields tabs: an ANNOUNCEMENT · POSTED BY · POSTED · STATUS grid with a text
// funnel on ANNOUNCEMENT, click-to-sort on POSTED, 1px row rules, em-dash for empty cells. A row click
// opens the editor; the accessible open trigger is the per-row control the parent wires via onOpen.
// Status is a StatusPill (colour always paired with its label). A pin marker shows in the ANNOUNCEMENT
// cell for pinned notices.

import type { ReactNode } from 'react';
import { PushPin } from '@phosphor-icons/react';

import type { AnnouncementListRow } from '@shared/types';

import {
  FilterFunnel,
  type FilterValue,
  type SortState,
  type TableColumn,
  TableShell,
} from '@/shared/components/Table';
import { StatusPill } from '@/shared/components/Feedback';

import { STATUS_PILL } from '../constants';
import type { AnnouncementsFilters } from '../announcementsView';

const EM_DASH = '—';

const COLUMNS: TableColumn[] = [
  { key: 'title', label: 'Announcement', width: 260, filterable: true },
  { key: 'postedBy', label: 'Posted by', width: 160 },
  { key: 'posted', label: 'Posted', width: 150, sortable: true },
  { key: 'status', label: 'Status', width: 130, flex: true },
];

/** "5 Jul 2026, 09:31" — locale-aware date + time for the POSTED cell (ux-copy-and-microcopy.md). */
function formatPosted(iso: string | undefined): string {
  if (!iso) return EM_DASH;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface AnnouncementsManageTableProps {
  rows: AnnouncementListRow[];
  sort: SortState | undefined;
  onSortChange: (next: SortState | undefined) => void;
  filters: AnnouncementsFilters;
  onFilterChange: (value: FilterValue) => void;
  onOpen: (row: AnnouncementListRow) => void;
}

export function AnnouncementsManageTable({
  rows,
  sort,
  onSortChange,
  filters,
  onFilterChange,
  onOpen,
}: AnnouncementsManageTableProps) {
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
      id: row.id,
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
        <StatusPill key="status" status={pill.kind} label={pill.label} />,
      ],
    };
  });

  return (
    // .ann-boxed scopes the boxed-rows treatment (announcements.css) to this table only — each row
    // reads as its own bordered card, so announcements stop blending into one another.
    <div className="ann-boxed">
      <TableShell
        caption="Announcements in this workspace"
        columns={COLUMNS}
        rows={tableRows}
        sort={sort}
        onSortChange={onSortChange}
        renderFilter={renderFilter}
      />
    </div>
  );
}

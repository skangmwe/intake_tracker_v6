// S29 members list — the shared list-surface (TableShell) so it reads like Requests / Feature
// Catalog: sortable Name / Last active headers, per-column funnel filters on Access level + Status,
// 1px row rules, no vertical dividers. Access level is plain text (the prototype), Status a pale
// StatusPill, and every row's actions live in a kebab overflow menu in the trailing column. A row is
// either a real member (Active / Suspended) or a pending invitation (Invited — no account, so name /
// last-active are em-dash and the level is read-only). Pagination is handled by the parent's footer.

import type { ReactNode } from 'react';

import type { AccessLevel, MemberStatus, WorkspaceMemberDto } from '@shared/types';

import { StatusPill } from '@/shared/components/Feedback';
import {
  type FilterOption,
  FilterFunnel,
  type FilterType,
  type FilterValue,
  type SortState,
  type TableColumn,
  TableShell,
} from '@/shared/components/Table';

import { LEVEL_OPTIONS } from '../constants';
import type { MemberColumnKey, MembersFilters } from '../membersView';
import { RowActionsMenu } from './RowActionsMenu';

const EM_DASH = '—';

// Every data column sorts and filters; the funnel type matches the data — text for Name / Email,
// select for Access level / Status, date range for Last active.
// Name absorbs the spare width (flex); Actions is a fixed, narrow trailing column holding the kebab.
const COLUMNS: TableColumn[] = [
  { key: 'name', label: 'Name', sortable: true, filterable: true, flex: true },
  { key: 'email', label: 'Email', width: 240, sortable: true, filterable: true },
  { key: 'level', label: 'Access level', width: 170, sortable: true, filterable: true },
  { key: 'status', label: 'Status', width: 140, sortable: true, filterable: true },
  { key: 'lastActive', label: 'Last active', width: 170, sortable: true, filterable: true },
  { key: 'actions', label: 'Actions', width: 64, align: 'center' },
];

const FILTER_TYPES: Record<MemberColumnKey, FilterType> = {
  name: 'text',
  email: 'text',
  level: 'select',
  status: 'select',
  lastActive: 'date',
};

function levelLabel(level: AccessLevel): string {
  return LEVEL_OPTIONS.find((option) => option.value === level)?.label ?? level;
}

function statusPill(status: MemberStatus): ReactNode {
  if (status === 'Invited') return <StatusPill status="warning" label="Invited" />;
  if (status === 'Suspended') return <StatusPill status="error" label="Suspended" />;
  return <StatusPill status="success" label="Active" />;
}

function formatLastActive(iso: string | null): string {
  if (iso === null) return EM_DASH;
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? EM_DASH
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

interface MembersTableProps {
  rows: WorkspaceMemberDto[];
  sort: SortState | undefined;
  onSortChange: (next: SortState | undefined) => void;
  filters: MembersFilters;
  onFilterChange: (column: MemberColumnKey, value: FilterValue) => void;
  levelOptions: FilterOption[];
  statusOptions: FilterOption[];
  onEditDetails: (member: WorkspaceMemberDto) => void;
  onSuspend: (member: WorkspaceMemberDto) => void;
  onReactivate: (member: WorkspaceMemberDto) => void;
  onRemove: (member: WorkspaceMemberDto) => void;
  onCancelInvitation: (member: WorkspaceMemberDto) => void;
}

export function MembersTable({
  rows,
  sort,
  onSortChange,
  filters,
  onFilterChange,
  levelOptions,
  statusOptions,
  onEditDetails,
  onSuspend,
  onReactivate,
  onRemove,
  onCancelInvitation,
}: MembersTableProps) {
  const renderFilter = (column: TableColumn): ReactNode => {
    const key = column.key as MemberColumnKey;
    const type = FILTER_TYPES[key];
    const options = key === 'level' ? levelOptions : key === 'status' ? statusOptions : undefined;
    return (
      <FilterFunnel
        type={type}
        columnLabel={column.label}
        options={options}
        value={filters[key] ?? { kind: type }}
        onChange={(next) => onFilterChange(key, next)}
      />
    );
  };

  const tableRows = rows.map((member) => {
    const identifier = member.displayName ?? member.email;
    return {
      id: member.userId ?? member.invitationId ?? member.email,
      cells: [
        <span key="name" className="users-access__name">
          {member.displayName ?? EM_DASH}
        </span>,
        <span key="email" className="users-access__email-cell">
          {member.email}
        </span>,
        levelLabel(member.level),
        <span key="status">{statusPill(member.status)}</span>,
        <span key="lastActive" className="users-access__last-active">
          {formatLastActive(member.lastActiveAt)}
        </span>,
        <RowActionsMenu
          key="actions"
          memberLabel={identifier}
          status={member.status}
          onEditDetails={() => onEditDetails(member)}
          onSuspend={() => onSuspend(member)}
          onReactivate={() => onReactivate(member)}
          onRemove={() => onRemove(member)}
          onCancelInvitation={() => onCancelInvitation(member)}
        />,
      ],
    };
  });

  return (
    <TableShell
      caption="Members of this workspace"
      columns={COLUMNS}
      rows={tableRows}
      sort={sort}
      onSortChange={onSortChange}
      renderFilter={renderFilter}
    />
  );
}

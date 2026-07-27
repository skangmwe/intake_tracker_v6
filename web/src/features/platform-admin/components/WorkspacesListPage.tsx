// Platform → Workspaces list (S38). A rich TableShell of every workspace (Hub + PG/Depts, excluding
// the clone template) with a New workspace primary action → the full-screen wizard. Read-only here;
// row editing/archiving is out of scope. PlatformGate is the UI courtesy; the API is the boundary.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from '@phosphor-icons/react';

import type { WorkspaceKind } from '@shared/types';

import { StatusPill } from '@/shared/components/Feedback';
import { TableShell, type TableColumn, type TableRow } from '@/shared/components/Table/TableShell';
import { formatDate } from '@/shared/utils/dateFormat';

import { PlatformGate } from './PlatformGate';
import { useWorkspacesList } from '../useWorkspacesList';
import '../newWorkspace.css';

const COLUMNS: TableColumn[] = [
  { key: 'name', label: 'Workspace', flex: true },
  { key: 'kind', label: 'Kind' },
  { key: 'prefix', label: 'ID Prefix' },
  { key: 'owner', label: 'Owner' },
  { key: 'members', label: 'Members', align: 'right' },
  { key: 'provisioned', label: 'Provisioned' },
  { key: 'status', label: 'Status' },
];

const KIND_LABEL: Record<WorkspaceKind, string> = {
  'ai-solutions': 'Hub',
  'pg-dept': 'PG/Dept',
  'pg-dept-template': 'Template', // excluded server-side; mapped for completeness
};

const EM_DASH = '—';

function WorkspacesTable() {
  const query = useWorkspacesList();

  const rows = useMemo<TableRow[]>(
    () =>
      (query.data ?? []).map((workspace) => ({
        id: workspace.id,
        cells: [
          <span className="wsl-name">{workspace.name}</span>,
          KIND_LABEL[workspace.kind],
          <span className="mono">{workspace.prefix}</span>,
          workspace.ownerDisplayName ?? <span className="wsl-owner--empty">{EM_DASH}</span>,
          workspace.memberCount,
          formatDate(workspace.provisionedAt),
          <StatusPill
            status={workspace.isArchived ? 'info' : 'success'}
            label={workspace.isArchived ? 'Archived' : 'Active'}
          />,
        ],
      })),
    [query.data],
  );

  if (query.isLoading) {
    return (
      <p className="caption" role="status">
        Loading workspaces…
      </p>
    );
  }

  if (query.isError) {
    return (
      <p className="mws-alert mws-alert--error" role="alert">
        Workspaces could not be loaded. Try again in a moment.
      </p>
    );
  }

  return <TableShell caption="Workspaces" columns={COLUMNS} rows={rows} />;
}

export function WorkspacesListPage() {
  return (
    <PlatformGate>
      <div className="wsl-header">
        <div>
          <p className="wsl-header__lead body">
            Every practice group or department gets its own workspace, provisioned from a base
            template. The hub workspace aggregates records across all of them.
          </p>
        </div>
        <Link to="/platform/workspaces/new" className="mws-btn mws-btn--primary wsl-header__action" data-ds="btn">
          <Plus size={18} weight="regular" aria-hidden /> New workspace
        </Link>
      </div>
      <WorkspacesTable />
    </PlatformGate>
  );
}

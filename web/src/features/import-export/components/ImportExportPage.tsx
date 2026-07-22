// S28 Import & export — the workspace-admin surface for CSV import (create-only) and CSV export
// (BS §13). Split into an Import tab and an Export tab, each hosting a wizard. Export also keeps the
// saved-view export as a second entry point below its wizard. Resolves the active workspace + admin
// level from the signed-in user; import/export are WorkspaceAdmin-only (the API enforces this too —
// the UI gate is a courtesy, not the boundary).

import { useMemo, useState } from 'react';

import { Tabs } from '@/shared/components/Feedback';
import { useMe } from '@/features/users/useMe';
import { resolveActiveWorkspaceId } from '@/shared/workspace/activeWorkspace';

import { ExportPanel } from './ExportPanel';
import { ExportWizard } from './ExportWizard';
import { ImportWizard } from './ImportWizard';

const TABS = [
  { id: 'import', label: 'Import' },
  { id: 'export', label: 'Export' },
];

export function ImportExportPage() {
  const { data: me, isLoading, isError } = useMe();
  const workspaceId = useMemo(() => resolveActiveWorkspaceId(me?.memberships), [me]);
  const isAdmin = useMemo(
    () =>
      (me?.memberships ?? []).some(
        (membership) =>
          membership.workspaceId === workspaceId && membership.level === 'WorkspaceAdmin',
      ),
    [me, workspaceId],
  );
  const [tab, setTab] = useState('import');

  if (isLoading) {
    return (
      <div className="import-export-page">
        <h1 className="h1 import-export-page__title">Import &amp; export</h1>
        <p className="caption" role="status">
          Loading…
        </p>
      </div>
    );
  }

  if (isError || !workspaceId) {
    return (
      <div className="import-export-page">
        <h1 className="h1 import-export-page__title">Import &amp; export</h1>
        <p className="mws-alert mws-alert--error" role="alert">
          This page could not be loaded. Try again in a moment.
        </p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="import-export-page">
        <h1 className="h1 import-export-page__title">Import &amp; export</h1>
        <p className="mws-alert mws-alert--warning" role="alert">
          Import and export are available to workspace admins. Ask a workspace admin if you need to
          run one.
        </p>
      </div>
    );
  }

  return (
    <div className="import-export-page">
      <h1 className="h1 import-export-page__title">Import &amp; export</h1>
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Import and export" />

      {tab === 'import' && (
        <div
          className="import-export-page__panel"
          role="tabpanel"
          id="panel-import"
          aria-labelledby="tab-import"
        >
          <ImportWizard workspaceId={workspaceId} />
        </div>
      )}

      {tab === 'export' && (
        <div
          className="import-export-page__panel"
          role="tabpanel"
          id="panel-export"
          aria-labelledby="tab-export"
        >
          <ExportWizard workspaceId={workspaceId} />
          <ExportPanel workspaceId={workspaceId} />
        </div>
      )}
    </div>
  );
}

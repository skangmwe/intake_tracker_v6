// S28 Import & export — the workspace-admin surface for CSV import (create-only) and Export view
// (BS §13). Resolves the active workspace + admin level from the signed-in user; import/export are
// WorkspaceAdmin-only (the API enforces this too — the UI gate is a courtesy, not the boundary).

import { useMemo } from 'react';

import { useMe } from '@/features/users/useMe';
import { resolveActiveWorkspaceId } from '@/shared/workspace/activeWorkspace';

import { ExportPanel } from './ExportPanel';
import { ImportPanel } from './ImportPanel';

export function ImportExportPage() {
  const { data: me, isLoading, isError } = useMe();
  const workspaceId = useMemo(() => resolveActiveWorkspaceId(me?.memberships), [me]);
  const isAdmin = useMemo(
    () =>
      (me?.memberships ?? []).some(
        (membership) => membership.workspaceId === workspaceId && membership.level === 'WorkspaceAdmin',
      ),
    [me, workspaceId],
  );

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
          Import and export are available to workspace admins. Ask a workspace admin if you need to run
          one.
        </p>
      </div>
    );
  }

  return (
    <div className="import-export-page">
      <h1 className="h1 import-export-page__title">Import &amp; export</h1>
      <div className="import-export-page__panels">
        <ImportPanel workspaceId={workspaceId} />
        <ExportPanel workspaceId={workspaceId} />
      </div>
    </div>
  );
}

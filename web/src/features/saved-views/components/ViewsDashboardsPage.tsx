// S32 Views & dashboards — the workspace-admin surface for managing shared saved views and dashboards
// (BS §10.5, §22.3-22.4). Resolves the active workspace + admin level from the signed-in user; the
// whole surface is WorkspaceAdmin-only (the API enforces it too — the UI gate is a courtesy). Renders
// one section per list surface (Requests / Feature Catalog / Tasks / Announcements).
//
// The shared-DASHBOARDS half of S32 is now live (slice 23): the DashboardsManagementSection lists the
// workspace's seeded dashboards and lets an admin edit their audience or retire them.

import { useMemo } from 'react';

import type { SavedViewObjectType } from '@shared/types';

import { resolveActiveWorkspaceId } from '@/shared/workspace/activeWorkspace';
import { useMe } from '@/features/users/useMe';
import { DashboardsManagementSection } from '@/features/dashboards';

import { SavedViewsSection } from './SavedViewsSection';

const OBJECT_TYPES: readonly SavedViewObjectType[] = ['Request', 'Feature', 'Task', 'Announcement'];

export function ViewsDashboardsPage() {
  const { data: me, isLoading: meLoading, isError: meError } = useMe();
  const workspaceId = useMemo(() => resolveActiveWorkspaceId(me?.memberships), [me]);
  const isAdmin = useMemo(
    () =>
      (me?.memberships ?? []).some(
        (membership) =>
          membership.workspaceId === workspaceId && membership.level === 'WorkspaceAdmin',
      ),
    [me, workspaceId],
  );

  if (meLoading) {
    return (
      <div className="views-admin">
        <p className="caption" role="status">
          Loading…
        </p>
      </div>
    );
  }

  if (meError || !workspaceId) {
    return (
      <div className="views-admin">
        <p className="mws-alert mws-alert--error" role="alert">
          This page could not be loaded. Try again in a moment.
        </p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="views-admin">
        <p className="mws-alert mws-alert--warning" role="alert">
          Views &amp; dashboards is available to workspace admins. Ask a workspace admin if you need
          a change.
        </p>
      </div>
    );
  }

  return (
    <div className="views-admin">
      {OBJECT_TYPES.map((objectType) => (
        <SavedViewsSection key={objectType} workspaceId={workspaceId} objectType={objectType} />
      ))}

      <DashboardsManagementSection workspaceId={workspaceId} />
    </div>
  );
}

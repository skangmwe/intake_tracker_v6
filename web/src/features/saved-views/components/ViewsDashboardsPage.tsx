// S32 Views & dashboards — the workspace-admin surface for managing shared saved views and dashboards
// (BS §10.5, §22.3-22.4). Resolves the active workspace + admin level from the signed-in user; the
// whole surface is WorkspaceAdmin-only (the API enforces it too — the UI gate is a courtesy). Renders
// one section per list surface (Requests / Feature Catalog / Tasks / Announcements).
//
// The shared-DASHBOARDS half of S32 lands with the Dashboards module (slice 23): the SavedDashboard
// table and the seeded dashboards it manages don't exist until then (data-model.md slice-1 note;
// module-boundaries.md §15), so there is nothing to manage here yet. It is shown as an explicit
// "arrives with dashboards" note — not a dead control — mirroring the build-order deferrals in
// slices 9→11 and 13→22.

import { useMemo } from 'react';

import type { SavedViewObjectType } from '@shared/types';

import { resolveActiveWorkspaceId } from '@/shared/workspace/activeWorkspace';
import { useMe } from '@/features/users/useMe';

import { SavedViewsSection } from './SavedViewsSection';

const OBJECT_TYPES: readonly SavedViewObjectType[] = ['Request', 'Feature', 'Task', 'Announcement'];

export function ViewsDashboardsPage() {
  const { data: me, isLoading: meLoading, isError: meError } = useMe();
  const workspaceId = useMemo(() => resolveActiveWorkspaceId(me?.memberships), [me]);
  const isAdmin = useMemo(
    () =>
      (me?.memberships ?? []).some(
        (membership) => membership.workspaceId === workspaceId && membership.level === 'WorkspaceAdmin',
      ),
    [me, workspaceId],
  );

  const title = <h1 className="h1 views-admin__title">Views &amp; dashboards</h1>;

  if (meLoading) {
    return (
      <div className="views-admin">
        {title}
        <p className="caption" role="status">
          Loading…
        </p>
      </div>
    );
  }

  if (meError || !workspaceId) {
    return (
      <div className="views-admin">
        {title}
        <p className="mws-alert mws-alert--error" role="alert">
          This page could not be loaded. Try again in a moment.
        </p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="views-admin">
        {title}
        <p className="mws-alert mws-alert--warning" role="alert">
          Views &amp; dashboards is available to workspace admins. Ask a workspace admin if you need a
          change.
        </p>
      </div>
    );
  }

  return (
    <div className="views-admin">
      {title}
      <p className="views-admin__lead">
        Manage the shared saved views on each list surface — promote a personal view to shared, set the
        default, or retire one. Retiring a view never changes any records.
      </p>

      {OBJECT_TYPES.map((objectType) => (
        <SavedViewsSection key={objectType} workspaceId={workspaceId} objectType={objectType} />
      ))}

      <section className="views-admin__section" aria-labelledby="views-dashboards-note">
        <h2 id="views-dashboards-note" className="h3 views-admin__section-title">
          Shared dashboards
        </h2>
        <p className="mws-alert mws-alert--info" role="note">
          Shared dashboard management arrives with dashboards. Until then, there are no dashboards to
          manage here.
        </p>
      </section>
    </div>
  );
}

// Workspace-admin AI settings surface (Phase 4, §14). Gates on workspace-admin membership and picks the
// workspace (mirrors TriggersAdminPage); the panel lives in AiConfigPanel. The surface title/lead render
// in the shared SideNavLayout header.

import { useState } from 'react';
import type { WorkspaceId } from '@shared/types';

import { useMe } from '@/features/users/useMe';

import { AiConfigPanel } from './AiConfigPanel';

export function AiSettingsPage() {
  const { data: me, isLoading: isMeLoading, isError: isMeError } = useMe();
  const adminMemberships = (me?.memberships ?? []).filter(
    (membership) => membership.level === 'WorkspaceAdmin',
  );

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<WorkspaceId | null>(null);
  const workspaceId = selectedWorkspaceId ?? adminMemberships[0]?.workspaceId ?? null;

  if (isMeLoading && !me) {
    return (
      <p className="caption" role="status">
        Loading your workspaces…
      </p>
    );
  }

  if (isMeError && !me) {
    return (
      <p className="mws-alert mws-alert--error" role="alert">
        We couldn’t load your access. Try again in a moment.
      </p>
    );
  }

  if (adminMemberships.length === 0 || workspaceId === null) {
    return (
      <section className="mws-empty mws-empty--zero">
        <p className="body">
          You need to be a workspace admin to manage AI settings. Ask an admin to grant access.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="AI settings">
      {adminMemberships.length > 1 && (
        <label className="mws-field">
          <span className="caption">Workspace</span>
          <select
            className="mws-select"
            value={workspaceId}
            onChange={(event) => setSelectedWorkspaceId(event.target.value as WorkspaceId)}
          >
            {adminMemberships.map((membership) => (
              <option key={membership.workspaceId} value={membership.workspaceId}>
                {membership.workspaceName}
              </option>
            ))}
          </select>
        </label>
      )}

      <AiConfigPanel workspaceId={workspaceId} />
    </section>
  );
}

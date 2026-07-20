// S29 Users & access — the workspace-admin surface for membership and approver-team management (BS
// §4.2 / §6.8). Resolves the active workspace + admin level from the signed-in user; the whole
// surface is WorkspaceAdmin-only (the API enforces it too — the UI gate is a courtesy, not the
// boundary). A Members / Approver teams tab bar switches the two panels; the three non-data states
// (loading / error / empty) are rendered explicitly (web-component-architecture.md).

import { useMemo, useState } from 'react';

import { useMe } from '@/features/users/useMe';
import { Tabs } from '@/shared/components/Feedback';
import { resolveActiveWorkspaceId } from '@/shared/workspace/activeWorkspace';

import { USERS_ACCESS_TABS, type UsersAccessTab } from '../constants';
import { ApproverTeamsPanel } from './ApproverTeamsPanel';
import { MembersPanel } from './MembersPanel';

export function UsersAccessPage() {
  const { data: me, isLoading: meLoading, isError: meError } = useMe();
  const workspaceId = useMemo(() => resolveActiveWorkspaceId(me?.memberships), [me]);
  const isAdmin = useMemo(
    () =>
      (me?.memberships ?? []).some(
        (membership) => membership.workspaceId === workspaceId && membership.level === 'WorkspaceAdmin',
      ),
    [me, workspaceId],
  );
  const [tab, setTab] = useState<UsersAccessTab>('members');

  const title = <h1 className="h1 users-access__title">Users &amp; access</h1>;

  if (meLoading) {
    return (
      <div className="users-access">
        {title}
        <p className="caption" role="status">
          Loading…
        </p>
      </div>
    );
  }

  if (meError || !workspaceId) {
    return (
      <div className="users-access">
        {title}
        <p className="mws-alert mws-alert--error" role="alert">
          This page could not be loaded. Try again in a moment.
        </p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="users-access">
        {title}
        <p className="mws-alert mws-alert--warning" role="alert">
          Users &amp; access is available to workspace admins. Ask a workspace admin if you need a
          change.
        </p>
      </div>
    );
  }

  return (
    <div className="users-access">
      {title}
      <p className="users-access__lead">
        Manage who can see and act in this workspace, and what each access level can do.
      </p>

      <Tabs
        tabs={USERS_ACCESS_TABS}
        value={tab}
        // Tabs reports the selected id as a plain string; our ids are the UsersAccessTab union.
        onChange={(id) => setTab(id as UsersAccessTab)}
        label="Users and access sections"
      />

      {tab === 'members' ? (
        <div role="tabpanel" id="tabpanel-members" aria-labelledby="tab-members">
          <MembersPanel workspaceId={workspaceId} />
        </div>
      ) : (
        <div role="tabpanel" id="tabpanel-teams" aria-labelledby="tab-teams">
          <ApproverTeamsPanel workspaceId={workspaceId} />
        </div>
      )}
    </div>
  );
}

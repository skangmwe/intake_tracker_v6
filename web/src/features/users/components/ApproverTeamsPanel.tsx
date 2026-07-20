// S29 Approver teams panel — a read-only view of the per-workspace approver-team roster (the groups
// that fill gate slots across every lifecycle). Editing still lives under Lifecycle & gates today, so
// this panel links there via "Manage teams"; a later slice moves the editor here (blueprint S29/S31).
// The roster is read through the workspace lifecycle config — the only place it is currently exposed.

import { Link } from 'react-router-dom';
import { UsersThree } from '@phosphor-icons/react';

import type { WorkspaceId } from '@shared/types';

import { useLifecycleConfig } from '@/features/lifecycle';

export function ApproverTeamsPanel({ workspaceId }: { workspaceId: WorkspaceId }) {
  const { data: config, isLoading, isError } = useLifecycleConfig(workspaceId);

  const manageLink = (
    <p className="users-access__teams-note">
      Approver teams are edited under Lifecycle &amp; gates.{' '}
      <Link className="mws-link" to="/admin/lifecycle">
        Manage teams
      </Link>
    </p>
  );

  if (isLoading) {
    return (
      <div className="users-access__panel">
        <p className="caption" role="status">
          Loading approver teams…
        </p>
      </div>
    );
  }

  if (isError || !config) {
    return (
      <div className="users-access__panel">
        <p className="mws-alert mws-alert--error" role="alert">
          The approver teams could not be loaded. Try again in a moment.
        </p>
      </div>
    );
  }

  if (config.approverTeams.length === 0) {
    return (
      <div className="users-access__panel">
        <p className="users-access__empty">No approver teams yet.</p>
        {manageLink}
      </div>
    );
  }

  return (
    <div className="users-access__panel">
      {manageLink}
      <ul className="users-access__teams" aria-label="Approver teams">
        {config.approverTeams.map((team) => (
          <li className="users-access__team" key={team.roleLabel}>
            <div className="users-access__team-head">
              <UsersThree size={16} aria-hidden />
              <span className="users-access__team-role">{team.roleLabel}</span>
              <span className="users-access__team-count">
                {team.members.length} {team.members.length === 1 ? 'member' : 'members'}
              </span>
            </div>
            {team.members.length > 0 ? (
              <ul className="users-access__team-members" aria-label={`${team.roleLabel} members`}>
                {team.members.map((member) => (
                  <li className="users-access__team-member" key={member.userId}>
                    {member.displayName}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="users-access__team-empty">No members yet</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// S29 Users & access — the workspace-admin surface for membership and level management (BS §4.2 /
// §6.8). Resolves the active workspace + admin level from the signed-in user; the whole surface is
// WorkspaceAdmin-only (the API enforces it too — the UI gate is a courtesy, not the boundary). Renders
// the three non-data states (loading / error / empty) explicitly (web-component-architecture.md).

import { useMemo, useState } from 'react';

import type { AccessLevel, UserId, WorkspaceMemberDto } from '@shared/types';

import { useMe } from '@/features/users/useMe';
import { problemMessage } from '@/shared/http/problemMessage';
import { resolveActiveWorkspaceId } from '@/shared/workspace/activeWorkspace';

import { useDeactivateMember, useMembers, useUpsertMember } from '../useMembers';
import { AddMemberForm } from './AddMemberForm';
import { DeactivateMemberDialog } from './DeactivateMemberDialog';
import { MembersTable } from './MembersTable';

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

  const enabledWorkspace = isAdmin ? (workspaceId ?? undefined) : undefined;
  const members = useMembers(enabledWorkspace);
  const levelUpsert = useUpsertMember(enabledWorkspace);
  const deactivate = useDeactivateMember(enabledWorkspace);
  const [toDeactivate, setToDeactivate] = useState<WorkspaceMemberDto | null>(null);

  const onChangeLevel = (userId: UserId, level: AccessLevel) => levelUpsert.mutate({ userId, level });

  const openDeactivate = (member: WorkspaceMemberDto) => {
    deactivate.reset();
    setToDeactivate(member);
  };

  const cancelDeactivate = () => {
    deactivate.reset();
    setToDeactivate(null);
  };

  const confirmDeactivate = () => {
    if (!toDeactivate) return;
    deactivate.mutate(toDeactivate.userId, { onSuccess: () => setToDeactivate(null) });
  };

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
      <p className="users-access__lead">Manage who belongs to this workspace and their access level.</p>

      <AddMemberForm workspaceId={workspaceId} />

      {levelUpsert.isError && (
        <p className="mws-alert mws-alert--error users-access__level-error" role="alert">
          {problemMessage(levelUpsert.error)}
        </p>
      )}

      {members.isLoading && (
        <p className="caption" role="status">
          Loading members…
        </p>
      )}

      {members.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          The member list could not be loaded. Try again in a moment.
        </p>
      )}

      {members.data && members.data.members.length === 0 && (
        <p className="users-access__empty">No members yet. Add one by email above.</p>
      )}

      {members.data && members.data.members.length > 0 && (
        <MembersTable
          members={members.data.members}
          onChangeLevel={onChangeLevel}
          onDeactivate={openDeactivate}
          pendingLevelUserId={levelUpsert.isPending ? levelUpsert.variables?.userId : undefined}
        />
      )}

      {toDeactivate && (
        <DeactivateMemberDialog
          member={toDeactivate}
          onConfirm={confirmDeactivate}
          onCancel={cancelDeactivate}
          isPending={deactivate.isPending}
          error={deactivate.isError ? deactivate.error : null}
        />
      )}
    </div>
  );
}

// S29 Members panel — the workspace membership list plus the add-member flow. ADD MEMBER reveals
// the add form (kept collapsed by default so the list leads); the level editor and Deactivate
// dialog live here too. Renders the three non-data states explicitly (web-component-architecture.md).

import { useState } from 'react';
import { Plus } from '@phosphor-icons/react';

import type { AccessLevel, UserId, WorkspaceId, WorkspaceMemberDto } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { problemMessage } from '@/shared/http/problemMessage';

import { useDeactivateMember, useMembers, useUpsertMember } from '../useMembers';
import { AddMemberForm } from './AddMemberForm';
import { DeactivateMemberDialog } from './DeactivateMemberDialog';
import { MembersTable } from './MembersTable';

export function MembersPanel({ workspaceId }: { workspaceId: WorkspaceId }) {
  const members = useMembers(workspaceId);
  const levelUpsert = useUpsertMember(workspaceId);
  const deactivate = useDeactivateMember(workspaceId);
  const [addOpen, setAddOpen] = useState(false);
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

  return (
    <div className="users-access__panel">
      <div className="users-access__toolbar">
        <Button
          onClick={() => setAddOpen((open) => !open)}
          aria-expanded={addOpen}
          aria-controls="users-access-add"
        >
          <Plus size={16} weight="regular" aria-hidden />
          Add member
        </Button>
      </div>

      {addOpen && (
        <div id="users-access-add">
          <AddMemberForm workspaceId={workspaceId} onClose={() => setAddOpen(false)} />
        </div>
      )}

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

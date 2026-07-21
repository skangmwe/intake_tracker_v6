// S29 Approver teams editor — the per-workspace approver-team roster plus full team management
// (create / rename / delete a team, add / remove members). A "team" is a firm-wide role label, so
// create/rename/delete edit the shared catalog (WorkspaceAdmin; the API authorizes). The roster and
// the "Fills N gate slots" usage are read from the workspace lifecycle config; each team card owns
// its own member/rename/delete interactions. The three non-data states are rendered explicitly
// (web-component-architecture.md).

import { useMemo, useState } from 'react';
import { Plus } from '@phosphor-icons/react';

import type { WorkspaceId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { useCreateApproverTeam, useLifecycleConfig } from '@/features/lifecycle';
import { problemMessage } from '@/shared/http/problemMessage';

import { useMembers } from '../useMembers';
import { ApproverTeamCard } from './ApproverTeamCard';
import type { MemberOption } from './ApproverMemberCombobox';

export function ApproverTeamsPanel({ workspaceId }: { workspaceId: WorkspaceId }) {
  const { data: config, isLoading, isError } = useLifecycleConfig(workspaceId);
  const { data: membersData } = useMembers(workspaceId);
  const [teamName, setTeamName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const createTeam = useCreateApproverTeam(workspaceId);

  // Active members feed the add-a-person typeahead in every team card. Invitations and suspended
  // members are excluded (the server only resolves active members).
  const memberOptions = useMemo<MemberOption[]>(
    () =>
      (membersData?.members ?? [])
        .filter((member) => member.status === 'Active' && member.userId !== null && member.displayName !== null)
        .map((member) => ({
          userId: member.userId as string,
          displayName: member.displayName as string,
          email: member.email,
        })),
    [membersData],
  );

  // Gate-slot usage per role label — how many gate slots across all lifecycles each team fills.
  const gateUsesByRole = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lifecycle of config?.lifecycles ?? []) {
      for (const gate of lifecycle.gates) {
        for (const slot of gate.slots) {
          counts.set(slot.roleLabel, (counts.get(slot.roleLabel) ?? 0) + 1);
        }
      }
    }
    return counts;
  }, [config]);

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

  const submitCreate = () => {
    const label = teamName.trim();
    if (label === '') return;
    createTeam.mutate(
      { label },
      {
        onSuccess: () => {
          setTeamName('');
          setCreateError(null);
        },
        onError: (mutationError) => setCreateError(problemMessage(mutationError)),
      },
    );
  };

  return (
    <div className="approver-teams">
      <div className="approver-teams__create">
        <label className="approver-teams__create-field">
          <span className="approver-teams__create-label">New approver team</span>
          <input
            className="mws-input"
            data-ds="input"
            type="text"
            value={teamName}
            placeholder="Team name — e.g. Model Risk"
            aria-label="New approver team name"
            onChange={(event) => setTeamName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitCreate();
              }
            }}
          />
        </label>
        <Button
          variant="primary"
          onClick={submitCreate}
          disabled={teamName.trim() === '' || createTeam.isPending}
        >
          <Plus size={16} aria-hidden /> Add team
        </Button>
      </div>

      {createError && (
        <p className="mws-alert mws-alert--error approver-teams__error" role="alert">
          {createError}
        </p>
      )}

      <p className="approver-teams__note">
        Approver teams are the groups that fill gate slots across every lifecycle. On a request, an
        approver picks their own name from their team. Members here also need workspace access on the
        Members tab to file their approvals.
      </p>

      <ul className="approver-teams__list" aria-label="Approver teams">
        {config.approverTeams.map((team) => (
          <ApproverTeamCard
            key={team.roleLabelId ?? team.roleLabel}
            workspaceId={workspaceId}
            team={team}
            gateUses={gateUsesByRole.get(team.roleLabel) ?? 0}
            memberOptions={memberOptions}
          />
        ))}
      </ul>
    </div>
  );
}

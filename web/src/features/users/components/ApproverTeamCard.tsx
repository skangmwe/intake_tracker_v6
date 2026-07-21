// One approver-team card on S29 Users & access → Approver teams. Matches the prototype: a
// users-three icon, an inline-editable team name, a "Fills N gate slots" usage label, a trash to
// delete the team, an "Add a person…" row, and member rows (avatar + name + email + remove).
// A "team" is a firm-wide role label, so rename/delete edit the catalog (WorkspaceAdmin, forward-
// only). A retired label with live members has no catalog id — its name is read-only and it cannot
// be deleted, but its members can still be removed.

import { useRef, useState } from 'react';
import { Plus, Trash, UsersThree, X } from '@phosphor-icons/react';

import type { ApproverTeamDto, WorkspaceId } from '@shared/types';

import { Button, IconButton } from '@/shared/components/Button';
import {
  useAddApproverMember,
  useDeleteApproverTeam,
  useRemoveApproverMember,
  useRenameApproverTeam,
} from '@/features/lifecycle';
import { initialsOf } from '@/shared/auth/authContext';
import { problemMessage } from '@/shared/http/problemMessage';

interface ApproverTeamCardProps {
  workspaceId: WorkspaceId;
  team: ApproverTeamDto;
  /** How many gate slots across all lifecycles this team fills — the usage label. */
  gateUses: number;
}

export function ApproverTeamCard({ workspaceId, team, gateUses }: ApproverTeamCardProps) {
  const roleLabelId = team.roleLabelId ?? null;
  const canEditTeam = roleLabelId !== null;

  const [nameDraft, setNameDraft] = useState(team.roleLabel);
  const [personDraft, setPersonDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Set on Escape so the blur it triggers cancels the commit instead of renaming to the draft.
  const skipCommitRef = useRef(false);

  const addMember = useAddApproverMember(workspaceId);
  const removeMember = useRemoveApproverMember(workspaceId);
  const renameTeam = useRenameApproverTeam(workspaceId);
  const deleteTeam = useDeleteApproverTeam(workspaceId);

  const usageText =
    gateUses > 0 ? `Fills ${gateUses} gate slot${gateUses === 1 ? '' : 's'}` : 'Not used by any gate yet';

  const commitName = () => {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      setNameDraft(team.roleLabel);
      return;
    }
    const label = nameDraft.trim();
    if (!canEditTeam || label === '' || label === team.roleLabel) {
      setNameDraft(team.roleLabel);
      return;
    }
    renameTeam.mutate(
      { roleLabelId: roleLabelId as string, request: { label } },
      {
        onSuccess: () => setError(null),
        onError: (mutationError) => {
          setError(problemMessage(mutationError));
          setNameDraft(team.roleLabel);
        },
      },
    );
  };

  const submitAdd = () => {
    const person = personDraft.trim();
    if (person === '') return;
    addMember.mutate(
      { roleLabel: team.roleLabel, person },
      {
        onSuccess: () => {
          setPersonDraft('');
          setError(null);
        },
        onError: (mutationError) => setError(problemMessage(mutationError)),
      },
    );
  };

  const removeOne = (userId: ApproverTeamDto['members'][number]['userId'], displayName: string) => {
    setError(null);
    removeMember.mutate(
      { roleLabel: team.roleLabel, userId },
      { onError: (mutationError) => setError(problemMessage(mutationError, `Couldn't remove ${displayName}. Try again.`)) },
    );
  };

  const removeTeam = () => {
    if (!canEditTeam) return;
    setError(null);
    deleteTeam.mutate(roleLabelId as string, {
      onError: (mutationError) => setError(problemMessage(mutationError)),
    });
  };

  return (
    <li className="approver-team">
      <div className="approver-team__head">
        <span className="approver-team__icon">
          <UsersThree size={18} aria-hidden />
        </span>
        <input
          className="approver-team__name"
          data-ds="input"
          type="text"
          value={nameDraft}
          aria-label="Team name"
          disabled={!canEditTeam}
          onChange={(event) => setNameDraft(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            } else if (event.key === 'Escape') {
              // Cancel the edit — the blur handler reverts the draft without renaming.
              skipCommitRef.current = true;
              event.currentTarget.blur();
            }
          }}
        />
        <span className="approver-team__usage">{usageText}</span>
        <span className="approver-team__spacer" />
        {canEditTeam && (
          <IconButton icon={Trash} label={`Delete team ${team.roleLabel}`} size={18} onClick={removeTeam} />
        )}
      </div>

      <div className="approver-team__add">
        <input
          className="mws-input mws-input--compact approver-team__add-input"
          data-ds="input"
          type="text"
          value={personDraft}
          placeholder="Add a person…"
          aria-label={`Add member to ${team.roleLabel}`}
          onChange={(event) => setPersonDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submitAdd();
            }
          }}
        />
        <Button variant="secondary" compact onClick={submitAdd}>
          <Plus size={16} aria-hidden /> Add member
        </Button>
      </div>

      {error && (
        <p className="mws-alert mws-alert--error approver-teams__error" role="alert">
          {error}
        </p>
      )}

      {team.members.length === 0 ? (
        <p className="approver-team__empty">No members yet</p>
      ) : (
        <ul className="approver-team__members" aria-label={`${team.roleLabel} members`}>
          {team.members.map((member) => (
            <li className="approver-team__member" key={member.userId}>
              <span className="approver-team__avatar" aria-hidden>
                {initialsOf(member.displayName)}
              </span>
              <span className="approver-team__member-meta">
                <span className="approver-team__member-name">{member.displayName}</span>
                {member.email && <span className="approver-team__member-email">{member.email}</span>}
              </span>
              <IconButton
                icon={X}
                label={`Remove ${member.displayName}`}
                size={16}
                onClick={() => removeOne(member.userId, member.displayName)}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// Section 3 of S31 — the per-workspace approver-team roster. Each role label lists its members as
// removable chips plus an add-a-person input. Members are real workspace users: the typed name or
// email is resolved server-side, so an unresolved entry surfaces the API's plain-language error.

import { useState } from 'react';
import { Plus, UsersThree, X } from '@phosphor-icons/react';
import type { ApproverTeamDto, UserId } from '@shared/types';

import { Button } from '@/shared/components/Button';

interface ApproverTeamsEditorProps {
  teams: ApproverTeamDto[];
  onAdd: (roleLabel: string, person: string) => Promise<void>;
  onRemove: (roleLabel: string, userId: UserId) => void;
  addError: string | null;
}

export function ApproverTeamsEditor({ teams, onAdd, onRemove, addError }: ApproverTeamsEditorProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const setDraft = (roleLabel: string, value: string) => setDrafts((prev) => ({ ...prev, [roleLabel]: value }));

  const submit = async (roleLabel: string) => {
    const person = (drafts[roleLabel] ?? '').trim();
    if (!person) return;
    try {
      await onAdd(roleLabel, person);
      setDraft(roleLabel, '');
    } catch {
      // The error is surfaced via addError; keep the typed value so the user can correct it.
    }
  };

  return (
    <section className="lifecycle-card__section" aria-labelledby="teams-heading">
      <div>
        <span className="lifecycle-badge" id="teams-heading">
          <span className="lifecycle-badge__num" aria-hidden>3</span>Approver teams
        </span>
        <p className="caption">
          Who can act on each role’s gate slots. On a request, the approver picks their own name from their team.
        </p>
      </div>

      {addError && <p className="mws-alert mws-alert--error" role="alert">{addError}</p>}

      <div role="list">
        {teams.map((team) => (
          <div className="lifecycle-team" key={team.roleLabel} role="listitem">
            <span className="lifecycle-eyebrow">
              <UsersThree size={15} aria-hidden />
              {team.roleLabel}
            </span>
            <div className="lifecycle-team__members">
              <div className="lifecycle-team__chips" role="list" aria-label={`${team.roleLabel} members`}>
                {team.members.map((member) => (
                  <span className="lifecycle-member" key={member.userId} role="listitem">
                    {member.displayName}
                    <button
                      type="button"
                      className="lifecycle-member__remove"
                      aria-label={`Remove ${member.displayName} from ${team.roleLabel}`}
                      onClick={() => onRemove(team.roleLabel, member.userId)}
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
              <input
                className="mws-input mws-input--compact lifecycle-inline-input"
                data-ds="input"
                placeholder="Add a person…"
                aria-label={`Add member to ${team.roleLabel}`}
                value={drafts[team.roleLabel] ?? ''}
                onChange={(event) => setDraft(team.roleLabel, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void submit(team.roleLabel);
                  }
                }}
              />
              <Button variant="secondary" compact onClick={() => void submit(team.roleLabel)}>
                <Plus size={16} aria-hidden /> Add
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

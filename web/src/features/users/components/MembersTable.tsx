// S29 members list — a semantic table (data-visualization.md): scoped column headers, 1px row
// rules, no vertical dividers, em-dash for empty cells. A row is either a real member (Active /
// Suspended) or a pending invitation (Invited — no account yet, so name / last-active are em-dash
// and the level select is read-only). Level is changed inline via a per-row native <select>;
// Active rows offer Deactivate, Invited rows offer Cancel invitation. The table scrolls within its
// own container so the page never scrolls horizontally.

import type { AccessLevel, UserId, WorkspaceMemberDto } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { StatusPill } from '@/shared/components/Feedback';

import { LEVEL_OPTIONS } from '../constants';

const EM_DASH = '—';

function formatLastActive(iso: string | null): string {
  if (iso === null) return EM_DASH;
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? EM_DASH
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

interface MembersTableProps {
  members: WorkspaceMemberDto[];
  onChangeLevel: (userId: UserId, level: AccessLevel) => void;
  onDeactivate: (member: WorkspaceMemberDto) => void;
  onCancelInvitation: (member: WorkspaceMemberDto) => void;
  /** The member whose level change is in flight — its select is disabled. */
  pendingLevelUserId?: UserId | null | undefined;
  /** The invitation whose cancellation is in flight — its button is disabled. */
  pendingCancelInvitationId?: string | null | undefined;
}

export function MembersTable({
  members,
  onChangeLevel,
  onDeactivate,
  onCancelInvitation,
  pendingLevelUserId,
  pendingCancelInvitationId,
}: MembersTableProps) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a horizontally-scrollable region must be keyboard-focusable so keyboard users can scroll it (axe scrollable-region-focusable).
    <div className="users-access__table-shell" tabIndex={0} role="region" aria-label="Workspace members">
      <table className="users-access__table">
        <caption className="users-access__caption">Members of this workspace</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Email</th>
            <th scope="col">Access level</th>
            <th scope="col">Status</th>
            <th scope="col">Last active</th>
            <th scope="col" className="users-access__col-action">
              <span className="mws-sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const isInvited = member.status === 'Invited';
            const identifier = member.displayName ?? member.email;
            return (
              <tr key={member.userId ?? member.invitationId ?? member.email}>
                <td>
                  <span className="users-access__name">{member.displayName ?? EM_DASH}</span>
                </td>
                <td className="users-access__email-cell">{member.email}</td>
                <td>
                  <select
                    className="mws-select users-access__level"
                    aria-label={`Access level for ${identifier}`}
                    value={member.level}
                    disabled={isInvited || pendingLevelUserId === member.userId}
                    onChange={(event) => {
                      if (member.userId !== null) {
                        onChangeLevel(member.userId, event.target.value as AccessLevel);
                      }
                    }}
                  >
                    {LEVEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {member.status === 'Invited' ? (
                    <StatusPill status="warning" label="Invited" />
                  ) : member.status === 'Suspended' ? (
                    <StatusPill status="error" label="Suspended" />
                  ) : (
                    <StatusPill status="success" label="Active" />
                  )}
                </td>
                <td className="users-access__last-active">{formatLastActive(member.lastActiveAt)}</td>
                <td className="users-access__col-action">
                  {isInvited ? (
                    <Button
                      variant="secondary"
                      compact
                      disabled={pendingCancelInvitationId === member.invitationId}
                      onClick={() => onCancelInvitation(member)}
                    >
                      {pendingCancelInvitationId === member.invitationId
                        ? 'Cancelling…'
                        : 'Cancel invitation'}
                    </Button>
                  ) : (
                    member.status === 'Active' && (
                      <Button variant="destructive" compact onClick={() => onDeactivate(member)}>
                        Deactivate
                      </Button>
                    )
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

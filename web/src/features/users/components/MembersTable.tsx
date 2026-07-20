// S29 members list — a semantic table (data-visualization.md): scoped column headers, 1px row
// rules, no vertical dividers, em-dash for empty cells. Level is changed inline via a per-row native
// <select> (an aria-labelled control per row); Deactivate opens the parent's confirm dialog. The
// table scrolls within its own container so the page never scrolls horizontally.

import type { AccessLevel, WorkspaceMemberDto } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { StatusPill } from '@/shared/components/Feedback';

import { LEVEL_OPTIONS } from '../constants';

const EM_DASH = '—';

function formatLastActive(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? EM_DASH
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

interface MembersTableProps {
  members: WorkspaceMemberDto[];
  onChangeLevel: (userId: WorkspaceMemberDto['userId'], level: AccessLevel) => void;
  onDeactivate: (member: WorkspaceMemberDto) => void;
  /** The member whose level change is in flight — its select is disabled. */
  pendingLevelUserId?: WorkspaceMemberDto['userId'] | undefined;
}

export function MembersTable({ members, onChangeLevel, onDeactivate, pendingLevelUserId }: MembersTableProps) {
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
          {members.map((member) => (
            <tr key={member.userId}>
              <td>
                <span className="users-access__name">{member.displayName}</span>
              </td>
              <td className="users-access__email-cell">{member.email}</td>
              <td>
                <select
                  className="mws-select users-access__level"
                  aria-label={`Access level for ${member.displayName}`}
                  value={member.level}
                  disabled={pendingLevelUserId === member.userId}
                  onChange={(event) => onChangeLevel(member.userId, event.target.value as AccessLevel)}
                >
                  {LEVEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                {member.isDisabled ? (
                  <StatusPill status="error" label="Suspended" />
                ) : (
                  <StatusPill status="success" label="Active" />
                )}
              </td>
              <td className="users-access__last-active">{formatLastActive(member.lastActiveAt)}</td>
              <td className="users-access__col-action">
                {!member.isDisabled && (
                  <Button variant="destructive" compact onClick={() => onDeactivate(member)}>
                    Deactivate
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

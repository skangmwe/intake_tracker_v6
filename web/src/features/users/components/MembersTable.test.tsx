// MembersTable — a pure presentational table. Verifies row rendering, the three status badges
// (Active / Suspended / Invited), inline level change, deactivate, cancel-invitation, and the
// pending disabled states. jest-axe runs against the default, disabled-member, and invited renders
// (web-testing.md accessibility requirement).

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { UserId } from '@shared/types';

import { buildInvitation, buildMember } from '@/test-utils';

import { MembersTable } from './MembersTable';

const noop = () => undefined;

const baseProps = {
  onChangeLevel: noop,
  onDeactivate: noop,
  onCancelInvitation: noop,
};

describe('MembersTable', () => {
  it('renders a row per member with identity, level, and last-active', () => {
    // Arrange
    const members = [
      buildMember({ displayName: 'Ada Byron', email: 'ada@mws.ai', level: 'WorkspaceAdmin' }),
      buildMember({ userId: '00000000-0000-0000-0000-0000000000a2' as UserId, displayName: 'Bo Chen', email: 'bo@mws.ai' }),
    ];

    // Act
    render(<MembersTable members={members} {...baseProps} />);

    // Assert
    expect(screen.getByText('Ada Byron')).toBeInTheDocument();
    expect(screen.getByText('bo@mws.ai')).toBeInTheDocument();
    expect(screen.getByLabelText('Access level for Ada Byron')).toHaveValue('WorkspaceAdmin');
  });

  it('shows an em-dash for a member with no valid last-active timestamp', () => {
    // Arrange — an unparseable timestamp renders the empty-cell em-dash, never a broken date.
    const members = [buildMember({ displayName: 'Never Active', lastActiveAt: 'not-a-date' })];

    // Act
    render(<MembersTable members={members} {...baseProps} />);

    // Assert
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows the Active badge for an enabled account', () => {
    // Arrange
    const members = [buildMember({ isDisabled: false })];

    // Act
    render(<MembersTable members={members} {...baseProps} />);

    // Assert
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows the Suspended badge and no Deactivate action for a disabled account', () => {
    // Arrange
    const members = [buildMember({ isDisabled: true, status: 'Suspended' })];

    // Act
    render(<MembersTable members={members} {...baseProps} />);

    // Assert
    expect(screen.getByText('Suspended')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /deactivate/i })).not.toBeInTheDocument();
  });

  it('renders a pending invitation with an em-dash name, the Invited badge, and a read-only level', () => {
    // Arrange — an invitation has no account, so name / last-active are em-dashes and the level is
    // read-only (there is no userId to change).
    const members = [buildInvitation({ email: 'invitee@mws.ai', level: 'Viewer' })];

    // Act
    render(<MembersTable members={members} {...baseProps} />);

    // Assert
    expect(screen.getByText('invitee@mws.ai')).toBeInTheDocument();
    expect(screen.getByText('Invited')).toBeInTheDocument();
    expect(screen.getByLabelText('Access level for invitee@mws.ai')).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel invitation/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /deactivate/i })).not.toBeInTheDocument();
  });

  it('calls onChangeLevel when the inline level is changed', async () => {
    // Arrange
    const member = buildMember({ displayName: 'Ada Byron', level: 'Member' });
    const onChangeLevel = jest.fn();
    const user = userEvent.setup();
    render(<MembersTable members={[member]} {...baseProps} onChangeLevel={onChangeLevel} />);

    // Act
    await user.selectOptions(screen.getByLabelText('Access level for Ada Byron'), 'Viewer');

    // Assert
    expect(onChangeLevel).toHaveBeenCalledWith(member.userId, 'Viewer');
  });

  it('calls onDeactivate when Deactivate is clicked', async () => {
    // Arrange
    const member = buildMember();
    const onDeactivate = jest.fn();
    const user = userEvent.setup();
    render(<MembersTable members={[member]} {...baseProps} onDeactivate={onDeactivate} />);

    // Act
    await user.click(screen.getByRole('button', { name: /deactivate/i }));

    // Assert
    expect(onDeactivate).toHaveBeenCalledWith(member);
  });

  it('calls onCancelInvitation when Cancel invitation is clicked', async () => {
    // Arrange
    const invitation = buildInvitation();
    const onCancelInvitation = jest.fn();
    const user = userEvent.setup();
    render(<MembersTable members={[invitation]} {...baseProps} onCancelInvitation={onCancelInvitation} />);

    // Act
    await user.click(screen.getByRole('button', { name: /cancel invitation/i }));

    // Assert
    expect(onCancelInvitation).toHaveBeenCalledWith(invitation);
  });

  it('disables the level select for the member whose change is in flight', () => {
    // Arrange
    const member = buildMember({ displayName: 'Ada Byron' });

    // Act
    render(<MembersTable members={[member]} {...baseProps} pendingLevelUserId={member.userId} />);

    // Assert
    expect(screen.getByLabelText('Access level for Ada Byron')).toBeDisabled();
  });

  it('disables the Cancel invitation button for the invitation whose cancellation is in flight', () => {
    // Arrange
    const invitation = buildInvitation();

    // Act
    render(
      <MembersTable
        members={[invitation]}
        {...baseProps}
        pendingCancelInvitationId={invitation.invitationId}
      />,
    );

    // Assert
    expect(screen.getByRole('button', { name: /cancelling…/i })).toBeDisabled();
  });

  it('has no axe violations (default, disabled-member, and invited states)', async () => {
    // Arrange + Act — default
    const { container, rerender } = render(<MembersTable members={[buildMember()]} {...baseProps} />);
    // Assert
    expect(await axe(container)).toHaveNoViolations();

    // Act — disabled member
    rerender(<MembersTable members={[buildMember({ isDisabled: true, status: 'Suspended' })]} {...baseProps} />);
    // Assert
    expect(await axe(container)).toHaveNoViolations();

    // Act — pending invitation
    rerender(<MembersTable members={[buildInvitation()]} {...baseProps} />);
    // Assert
    expect(await axe(container)).toHaveNoViolations();
  });
});

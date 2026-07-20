// MembersTable — the members list rendered on the shared TableShell. Verifies row content (plain-text
// access level, the three status badges, em-dash for a bad timestamp), the sortable header and funnel
// filters, and that the per-row kebab menu wires through to the level / suspend / cancel callbacks.
// jest-axe runs against the default, invited, and menu-open renders (web-testing.md).

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { UserId } from '@shared/types';

import { buildInvitation, buildMember } from '@/test-utils';

import { LEVEL_OPTIONS, STATUS_FILTER_OPTIONS } from '../constants';
import { MembersTable } from './MembersTable';

const baseProps = {
  sort: undefined,
  onSortChange: () => undefined,
  filters: {},
  onFilterChange: () => undefined,
  levelOptions: LEVEL_OPTIONS.map((option) => ({ ...option })),
  statusOptions: STATUS_FILTER_OPTIONS.map((option) => ({ ...option })),
  onEditDetails: () => undefined,
  onSuspend: () => undefined,
  onReactivate: () => undefined,
  onRemove: () => undefined,
  onCancelInvitation: () => undefined,
};

describe('MembersTable', () => {
  it('MembersTable — member row — renders identity, plain-text level, and last active', () => {
    // Arrange
    const rows = [
      buildMember({ displayName: 'Ada Byron', email: 'ada@mws.ai', level: 'WorkspaceAdmin' }),
    ];

    // Act
    render(<MembersTable {...baseProps} rows={rows} />);

    // Assert — level is text, never a select control.
    expect(screen.getByText('Ada Byron')).toBeInTheDocument();
    expect(screen.getByText('ada@mws.ai')).toBeInTheDocument();
    expect(screen.getByText('Workspace admin')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('MembersTable — bad last-active timestamp — renders the em-dash', () => {
    // Arrange
    const rows = [buildMember({ displayName: 'Never Active', lastActiveAt: 'not-a-date' })];

    // Act
    render(<MembersTable {...baseProps} rows={rows} />);

    // Assert
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('MembersTable — status column — renders the Active / Suspended / Invited badges', () => {
    // Arrange
    const rows = [
      buildMember({ userId: '00000000-0000-0000-0000-0000000000a1' as UserId, isDisabled: false }),
      buildMember({ userId: '00000000-0000-0000-0000-0000000000a2' as UserId, isDisabled: true, status: 'Suspended' }),
      buildInvitation(),
    ];

    // Act
    render(<MembersTable {...baseProps} rows={rows} />);

    // Assert
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Suspended')).toBeInTheDocument();
    expect(screen.getByText('Invited')).toBeInTheDocument();
  });

  it('MembersTable — sortable Name header — calls onSortChange ascending', async () => {
    // Arrange
    const onSortChange = jest.fn();
    const user = userEvent.setup();
    render(<MembersTable {...baseProps} rows={[buildMember()]} onSortChange={onSortChange} />);

    // Act
    await user.click(screen.getByRole('button', { name: 'Name' }));

    // Assert
    expect(onSortChange).toHaveBeenCalledWith({ column: 'name', direction: 'asc' });
  });

  it('MembersTable — funnel filters — present on Access level and Status columns', () => {
    // Act
    render(<MembersTable {...baseProps} rows={[buildMember()]} />);

    // Assert
    expect(screen.getByRole('button', { name: 'Filter Access level' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filter Status' })).toBeInTheDocument();
  });

  it('MembersTable — kebab → Suspend member — passes the member to onSuspend', async () => {
    // Arrange
    const member = buildMember({ displayName: 'Ada Byron' });
    const onSuspend = jest.fn();
    const user = userEvent.setup();
    render(<MembersTable {...baseProps} rows={[member]} onSuspend={onSuspend} />);

    // Act
    await user.click(screen.getByRole('button', { name: 'Actions for Ada Byron' }));
    await user.click(screen.getByRole('menuitem', { name: 'Suspend member' }));

    // Assert
    expect(onSuspend).toHaveBeenCalledWith(member);
  });

  it('MembersTable — kebab → Edit details — passes the member to onEditDetails', async () => {
    // Arrange
    const member = buildMember({ displayName: 'Ada Byron', level: 'Member' });
    const onEditDetails = jest.fn();
    const user = userEvent.setup();
    render(<MembersTable {...baseProps} rows={[member]} onEditDetails={onEditDetails} />);

    // Act
    await user.click(screen.getByRole('button', { name: 'Actions for Ada Byron' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit details' }));

    // Assert
    expect(onEditDetails).toHaveBeenCalledWith(member);
  });

  it('MembersTable — kebab → Cancel invitation — passes the invitation to onCancelInvitation', async () => {
    // Arrange
    const invitation = buildInvitation({ email: 'invitee@mws.ai' });
    const onCancelInvitation = jest.fn();
    const user = userEvent.setup();
    render(<MembersTable {...baseProps} rows={[invitation]} onCancelInvitation={onCancelInvitation} />);

    // Act
    await user.click(screen.getByRole('button', { name: 'Actions for invitee@mws.ai' }));
    await user.click(screen.getByRole('menuitem', { name: 'Cancel invitation' }));

    // Assert
    expect(onCancelInvitation).toHaveBeenCalledWith(invitation);
  });

  it('MembersTable — no axe violations (default, invited, menu-open)', async () => {
    // Arrange + Act — default
    const user = userEvent.setup();
    const { container, rerender } = render(<MembersTable {...baseProps} rows={[buildMember()]} />);
    // Assert
    expect(await axe(container)).toHaveNoViolations();

    // Act — invited row
    rerender(<MembersTable {...baseProps} rows={[buildInvitation()]} />);
    // Assert
    expect(await axe(container)).toHaveNoViolations();

    // Act — menu open
    await user.click(screen.getByRole('button', { name: /actions for/i }));
    // Assert
    expect(await axe(container)).toHaveNoViolations();
  });
});

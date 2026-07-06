// MembersTable — a pure presentational table. Verifies row rendering, the disabled badge, inline
// level change, deactivate, and the pending-level disabled state. jest-axe runs against the default
// and disabled-member renders (web-testing.md accessibility requirement).

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { UserId } from '@shared/types';

import { buildMember } from '@/test-utils';

import { MembersTable } from './MembersTable';

const noop = () => undefined;

describe('MembersTable', () => {
  it('renders a row per member with identity, level, and last-active', () => {
    // Arrange
    const members = [
      buildMember({ displayName: 'Ada Byron', email: 'ada@mws.ai', level: 'WorkspaceAdmin' }),
      buildMember({ userId: '00000000-0000-0000-0000-0000000000a2' as UserId, displayName: 'Bo Chen', email: 'bo@mws.ai' }),
    ];

    // Act
    render(<MembersTable members={members} onChangeLevel={noop} onDeactivate={noop} />);

    // Assert
    expect(screen.getByText('Ada Byron')).toBeInTheDocument();
    expect(screen.getByText('bo@mws.ai')).toBeInTheDocument();
    expect(screen.getByLabelText('Level for Ada Byron')).toHaveValue('WorkspaceAdmin');
  });

  it('shows the Disabled badge for a disabled account', () => {
    // Arrange
    const members = [buildMember({ isDisabled: true })];

    // Act
    render(<MembersTable members={members} onChangeLevel={noop} onDeactivate={noop} />);

    // Assert
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('calls onChangeLevel when the inline level is changed', async () => {
    // Arrange
    const member = buildMember({ displayName: 'Ada Byron', level: 'Member' });
    const onChangeLevel = jest.fn();
    const user = userEvent.setup();
    render(<MembersTable members={[member]} onChangeLevel={onChangeLevel} onDeactivate={noop} />);

    // Act
    await user.selectOptions(screen.getByLabelText('Level for Ada Byron'), 'Viewer');

    // Assert
    expect(onChangeLevel).toHaveBeenCalledWith(member.userId, 'Viewer');
  });

  it('calls onDeactivate when Deactivate is clicked', async () => {
    // Arrange
    const member = buildMember();
    const onDeactivate = jest.fn();
    const user = userEvent.setup();
    render(<MembersTable members={[member]} onChangeLevel={noop} onDeactivate={onDeactivate} />);

    // Act
    await user.click(screen.getByRole('button', { name: /deactivate/i }));

    // Assert
    expect(onDeactivate).toHaveBeenCalledWith(member);
  });

  it('disables the level select for the member whose change is in flight', () => {
    // Arrange
    const member = buildMember({ displayName: 'Ada Byron' });

    // Act
    render(
      <MembersTable
        members={[member]}
        onChangeLevel={noop}
        onDeactivate={noop}
        pendingLevelUserId={member.userId}
      />,
    );

    // Assert
    expect(screen.getByLabelText('Level for Ada Byron')).toBeDisabled();
  });

  it('has no axe violations (default and disabled-member states)', async () => {
    // Arrange + Act — default
    const { container, rerender } = render(
      <MembersTable members={[buildMember()]} onChangeLevel={noop} onDeactivate={noop} />,
    );
    // Assert
    expect(await axe(container)).toHaveNoViolations();

    // Act — disabled member
    rerender(
      <MembersTable members={[buildMember({ isDisabled: true })]} onChangeLevel={noop} onDeactivate={noop} />,
    );
    // Assert
    expect(await axe(container)).toHaveNoViolations();
  });
});

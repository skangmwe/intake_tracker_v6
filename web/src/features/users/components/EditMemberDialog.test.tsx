// EditMemberDialog — the modal reached from the row kebab's "Edit details". Covers the read-only
// identity, the access-level select defaulting to the member's level, Save gated on an actual change,
// the save / cancel callbacks, and the inline error. jest-axe runs against the default and error states.

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { buildMember } from '@/test-utils';

import { EditMemberDialog } from './EditMemberDialog';

const baseProps = {
  onSave: () => undefined,
  onCancel: () => undefined,
  isPending: false,
  error: null,
};

describe('EditMemberDialog', () => {
  it('EditMemberDialog — open — shows identity and the current level, Save disabled until changed', () => {
    // Arrange
    const member = buildMember({ displayName: 'Ada Byron', email: 'ada@mws.ai', level: 'Member' });

    // Act
    render(<EditMemberDialog {...baseProps} member={member} />);

    // Assert
    expect(screen.getByText('Ada Byron')).toBeInTheDocument();
    expect(screen.getByText('ada@mws.ai')).toBeInTheDocument();
    expect(screen.getByLabelText('Access level')).toHaveValue('Member');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('EditMemberDialog — change level then Save — calls onSave with the new level', async () => {
    // Arrange
    const member = buildMember({ displayName: 'Ada Byron', level: 'Member' });
    const onSave = jest.fn();
    const user = userEvent.setup();
    render(<EditMemberDialog {...baseProps} member={member} onSave={onSave} />);

    // Act
    await user.selectOptions(screen.getByLabelText('Access level'), 'WorkspaceAdmin');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    // Assert
    expect(onSave).toHaveBeenCalledWith('WorkspaceAdmin');
  });

  it('EditMemberDialog — Cancel — calls onCancel', async () => {
    // Arrange
    const member = buildMember({ displayName: 'Ada Byron' });
    const onCancel = jest.fn();
    const user = userEvent.setup();
    render(<EditMemberDialog {...baseProps} member={member} onCancel={onCancel} />);

    // Act
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    // Assert
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('EditMemberDialog — pending — disables both actions', () => {
    // Arrange
    const member = buildMember({ displayName: 'Ada Byron' });

    // Act
    render(<EditMemberDialog {...baseProps} member={member} isPending />);

    // Assert
    expect(screen.getByRole('button', { name: /saving…/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeDisabled();
  });

  it('EditMemberDialog — no axe violations (default and error states)', async () => {
    // Arrange
    const member = buildMember({ displayName: 'Ada Byron' });

    // Act — default
    const { container, rerender } = render(<EditMemberDialog {...baseProps} member={member} />);
    // Assert
    expect(await axe(container)).toHaveNoViolations();

    // Act — error
    rerender(<EditMemberDialog {...baseProps} member={member} error={new Error('nope')} />);
    // Assert
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

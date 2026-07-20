// DeactivateMemberDialog — confirms a destructive action, names the member, surfaces the 409 block.
// jest-axe runs against the default and error (blocked) states (web-testing.md accessibility
// requirement — the modal is focus-trapped so both states are exercised under axe).

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiError } from '@/shared/http/apiClient';
import { buildMember } from '@/test-utils';

import { DeactivateMemberDialog } from './DeactivateMemberDialog';

const member = buildMember({ displayName: 'Ada Byron' });

function conflict(detail: string): ApiError {
  return new ApiError(409, { type: 't', title: 'Conflict', status: 409, detail });
}

describe('DeactivateMemberDialog', () => {
  it('names the member in the body and the destructive action', () => {
    // Act
    render(
      <DeactivateMemberDialog member={member} onConfirm={jest.fn()} onCancel={jest.fn()} isPending={false} error={null} />,
    );

    // Assert
    expect(screen.getByRole('button', { name: 'Remove Ada Byron' })).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent(/from this workspace and disables/i);
  });

  it('calls onConfirm and onCancel from the action buttons', async () => {
    // Arrange
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const user = userEvent.setup();
    render(
      <DeactivateMemberDialog member={member} onConfirm={onConfirm} onCancel={onCancel} isPending={false} error={null} />,
    );

    // Act
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    await user.click(screen.getByRole('button', { name: 'Remove Ada Byron' }));

    // Assert
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows a pending label and disables the actions while removing', () => {
    // Act
    render(
      <DeactivateMemberDialog member={member} onConfirm={jest.fn()} onCancel={jest.fn()} isPending error={null} />,
    );

    // Assert
    const confirm = screen.getByRole('button', { name: /removing…/i });
    expect(confirm).toBeDisabled();
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeDisabled();
  });

  it('surfaces the 409 block reason and has no axe violations in each state', async () => {
    // Arrange + Act — default
    const { container, rerender } = render(
      <DeactivateMemberDialog member={member} onConfirm={jest.fn()} onCancel={jest.fn()} isPending={false} error={null} />,
    );
    // Assert
    expect(await axe(container)).toHaveNoViolations();

    // Act — blocked (409)
    rerender(
      <DeactivateMemberDialog
        member={member}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
        isPending={false}
        error={conflict('This user has a pending individual sign-off. Reassign or resolve it before deactivating them.')}
      />,
    );
    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(/pending individual sign-off/i);
    expect(await axe(container)).toHaveNoViolations();
  });
});

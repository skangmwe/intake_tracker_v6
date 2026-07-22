// RowActionsMenu — the kebab overflow menu for a member row. Covers open/close, the status-dependent
// action set (Active → Edit details / Suspend member / Remove; Suspended → Edit details / Reactivate /
// Remove; Invited → Cancel invitation), that each action fires its callback and closes the menu, and
// keyboard arrow navigation. jest-axe runs against the closed and open (menu) states.

import { axe } from 'jest-axe';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RowActionsMenu } from './RowActionsMenu';

const noop = () => undefined;

const baseProps = {
  memberLabel: 'Ada Byron',
  onEditDetails: noop,
  onSuspend: noop,
  onReactivate: noop,
  onRemove: noop,
  onCancelInvitation: noop,
};

const openMenu = async (label = 'Actions for Ada Byron') => {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: label }));
  return user;
};

describe('RowActionsMenu', () => {
  it('RowActionsMenu — closed — shows only the trigger, no menu', () => {
    // Act
    render(<RowActionsMenu {...baseProps} status="Active" />);

    // Assert
    expect(screen.getByRole('button', { name: 'Actions for Ada Byron' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('RowActionsMenu — Active member — Edit details, Suspend member, Remove from workspace', async () => {
    // Arrange + Act
    render(<RowActionsMenu {...baseProps} status="Active" />);
    await openMenu();

    // Assert
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Edit details' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Suspend member' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Remove from workspace' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Reactivate' })).not.toBeInTheDocument();

    // Each action carries a one-line description below its label.
    expect(within(menu).getByText('Change their access level.')).toBeInTheDocument();
    expect(within(menu).getByText('Block access for now; they stay listed.')).toBeInTheDocument();
    expect(within(menu).getByText('Take them off the roster; re-add to restore.')).toBeInTheDocument();
  });

  it('RowActionsMenu — the description is wired to its action as an accessible description', async () => {
    // Arrange + Act
    render(<RowActionsMenu {...baseProps} status="Active" />);
    await openMenu();

    // Assert — the accessible name stays the bare action; the description is linked via aria-describedby.
    const edit = screen.getByRole('menuitem', { name: 'Edit details' });
    expect(edit).toHaveAccessibleDescription('Change their access level.');
  });

  it('RowActionsMenu — Suspended member — offers Reactivate instead of Suspend', async () => {
    // Arrange + Act
    render(<RowActionsMenu {...baseProps} status="Suspended" />);
    await openMenu();

    // Assert
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Reactivate' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Suspend member' })).not.toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Remove from workspace' })).toBeInTheDocument();
    expect(within(menu).getByText("Restore a suspended member's access.")).toBeInTheDocument();
  });

  it('RowActionsMenu — Invited row — offers only Cancel invitation', async () => {
    // Arrange + Act
    render(<RowActionsMenu {...baseProps} memberLabel="invitee@mws.ai" status="Invited" />);
    await openMenu('Actions for invitee@mws.ai');

    // Assert
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Cancel invitation' })).toBeInTheDocument();
    expect(within(menu).getByText('Withdraw this pending invite.')).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Edit details' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Remove from workspace' })).not.toBeInTheDocument();
  });

  it('RowActionsMenu — Edit details — fires onEditDetails and closes', async () => {
    // Arrange
    const onEditDetails = jest.fn();
    render(<RowActionsMenu {...baseProps} status="Active" onEditDetails={onEditDetails} />);
    const user = await openMenu();

    // Act
    await user.click(screen.getByRole('menuitem', { name: 'Edit details' }));

    // Assert
    expect(onEditDetails).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('RowActionsMenu — Suspend member — fires onSuspend and closes', async () => {
    // Arrange
    const onSuspend = jest.fn();
    render(<RowActionsMenu {...baseProps} status="Active" onSuspend={onSuspend} />);
    const user = await openMenu();

    // Act
    await user.click(screen.getByRole('menuitem', { name: 'Suspend member' }));

    // Assert
    expect(onSuspend).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('RowActionsMenu — Reactivate — fires onReactivate', async () => {
    // Arrange
    const onReactivate = jest.fn();
    render(<RowActionsMenu {...baseProps} status="Suspended" onReactivate={onReactivate} />);
    const user = await openMenu();

    // Act
    await user.click(screen.getByRole('menuitem', { name: 'Reactivate' }));

    // Assert
    expect(onReactivate).toHaveBeenCalledTimes(1);
  });

  it('RowActionsMenu — Remove from workspace — fires onRemove', async () => {
    // Arrange
    const onRemove = jest.fn();
    render(<RowActionsMenu {...baseProps} status="Active" onRemove={onRemove} />);
    const user = await openMenu();

    // Act
    await user.click(screen.getByRole('menuitem', { name: 'Remove from workspace' }));

    // Assert
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('RowActionsMenu — Cancel invitation — fires onCancelInvitation', async () => {
    // Arrange
    const onCancelInvitation = jest.fn();
    render(<RowActionsMenu {...baseProps} status="Invited" onCancelInvitation={onCancelInvitation} />);
    const user = await openMenu();

    // Act
    await user.click(screen.getByRole('menuitem', { name: 'Cancel invitation' }));

    // Assert
    expect(onCancelInvitation).toHaveBeenCalledTimes(1);
  });

  it('RowActionsMenu — ArrowDown — moves focus from the first to the second item', async () => {
    // Arrange — open auto-focuses the first item (Edit details).
    render(<RowActionsMenu {...baseProps} status="Active" />);
    const user = await openMenu();
    expect(screen.getByRole('menuitem', { name: 'Edit details' })).toHaveFocus();

    // Act
    await user.keyboard('{ArrowDown}');

    // Assert
    expect(screen.getByRole('menuitem', { name: 'Suspend member' })).toHaveFocus();
  });

  it('RowActionsMenu — End then Home — jump to the last and first items', async () => {
    // Arrange
    render(<RowActionsMenu {...baseProps} status="Active" />);
    const user = await openMenu();

    // Act + Assert
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Remove from workspace' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'Edit details' })).toHaveFocus();
  });

  it('RowActionsMenu — no axe violations (closed and open states)', async () => {
    // Arrange + Act — closed
    const { container } = render(<RowActionsMenu {...baseProps} status="Active" />);
    // Assert
    expect(await axe(container)).toHaveNoViolations();

    // Act — open
    await openMenu();
    // Assert
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RowActionsMenu — no axe violations (Suspended and Invited open menus)', async () => {
    // Arrange + Act — Suspended (Reactivate + destructive Remove)
    const suspended = render(<RowActionsMenu {...baseProps} status="Suspended" />);
    await openMenu();
    // Assert
    expect(await axe(suspended.container)).toHaveNoViolations();
    suspended.unmount();

    // Act — Invited (destructive Cancel invitation only)
    const invited = render(
      <RowActionsMenu {...baseProps} memberLabel="invitee@mws.ai" status="Invited" />,
    );
    await openMenu('Actions for invitee@mws.ai');
    // Assert
    expect(await axe(invited.container)).toHaveNoViolations();
  });
});

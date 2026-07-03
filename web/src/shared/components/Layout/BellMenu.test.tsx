import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { BellMenu } from './BellMenu';

describe('BellMenu', () => {
  it('BellMenu — closed — the trigger is collapsed', () => {
    render(<BellMenu />);
    expect(screen.getByRole('button', { name: 'Notifications' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('BellMenu — opened — shows the notification + announcement items', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<BellMenu />);

    // Act
    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    // Assert
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Announcement history' })).toBeInTheDocument();
  });

  it('BellMenu — selecting an item closes the menu', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<BellMenu />);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    // Act
    await user.click(screen.getByRole('menuitem', { name: 'Announcement history' }));

    // Assert
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('BellMenu — no axe violations (closed and open)', async () => {
    const user = userEvent.setup();
    const { container } = render(<BellMenu />);
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(await axe(container)).toHaveNoViolations();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { Bell } from '@phosphor-icons/react';

import { IconButton } from './IconButton';

describe('IconButton', () => {
  it('IconButton — renders — exposes its label as the accessible name', () => {
    render(<IconButton icon={Bell} label="Notifications" />);
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('IconButton — clicked — invokes onClick', async () => {
    // Arrange
    const onClick = jest.fn();
    const user = userEvent.setup();
    render(<IconButton icon={Bell} label="Notifications" onClick={onClick} />);

    // Act
    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    // Assert
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('IconButton — with popup props — reflects aria-haspopup/expanded', () => {
    render(<IconButton icon={Bell} label="Notifications" ariaHasPopup="menu" ariaExpanded />);
    const button = screen.getByRole('button', { name: 'Notifications' });
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('IconButton — no axe violations', async () => {
    const { container } = render(<IconButton icon={Bell} label="Notifications" bordered />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

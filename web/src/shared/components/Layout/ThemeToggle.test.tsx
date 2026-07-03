import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  it('ThemeToggle — light theme — offers to switch to dark', () => {
    render(<ThemeToggle theme="light" onToggle={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument();
  });

  it('ThemeToggle — dark theme — offers to switch to light', () => {
    render(<ThemeToggle theme="dark" onToggle={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
  });

  it('ThemeToggle — clicked — calls onToggle', async () => {
    // Arrange
    const onToggle = jest.fn();
    const user = userEvent.setup();
    render(<ThemeToggle theme="light" onToggle={onToggle} />);

    // Act
    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));

    // Assert
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('ThemeToggle — no axe violations in both themes', async () => {
    const light = render(<ThemeToggle theme="light" onToggle={jest.fn()} />);
    expect(await axe(light.container)).toHaveNoViolations();
    const dark = render(<ThemeToggle theme="dark" onToggle={jest.fn()} />);
    expect(await axe(dark.container)).toHaveNoViolations();
  });
});

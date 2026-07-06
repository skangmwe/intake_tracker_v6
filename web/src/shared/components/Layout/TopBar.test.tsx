import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { renderWithProviders } from '@/test-utils';

import { TopBar } from './TopBar';

function renderTopBar(props: Partial<Parameters<typeof TopBar>[0]> = {}) {
  return renderWithProviders(
    <TopBar
      title="Home"
      theme="light"
      onToggleTheme={jest.fn()}
      onOpenDrawer={jest.fn()}
      {...props}
    />,
  );
}

describe('TopBar', () => {
  it('TopBar — shows the page title and the control cluster', () => {
    renderTopBar();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search this workspace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account — Priya Raman' })).toBeInTheDocument();
  });

  it('TopBar — hamburger — opens the drawer', async () => {
    // Arrange
    const onOpenDrawer = jest.fn();
    const user = userEvent.setup();
    renderTopBar({ onOpenDrawer });

    // Act
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));

    // Assert
    expect(onOpenDrawer).toHaveBeenCalledTimes(1);
  });

  it('TopBar — theme toggle — calls onToggleTheme', async () => {
    // Arrange
    const onToggleTheme = jest.fn();
    const user = userEvent.setup();
    renderTopBar({ onToggleTheme });

    // Act
    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));

    // Assert
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it('TopBar — no axe violations', async () => {
    const { container } = renderTopBar();
    expect(await axe(container)).toHaveNoViolations();
  });
});

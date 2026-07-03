import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { buildAuth, renderWithProviders } from '@/test-utils';

import { AccountMenu } from './AccountMenu';

describe('AccountMenu', () => {
  it('AccountMenu — renders the caller initials on the avatar', () => {
    renderWithProviders(<AccountMenu />);
    expect(screen.getByRole('button', { name: 'Account — Priya Raman' })).toHaveTextContent('PR');
  });

  it('AccountMenu — opened — shows the account header + Sign out', async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithProviders(<AccountMenu />);

    // Act
    await user.click(screen.getByRole('button', { name: 'Account — Priya Raman' }));

    // Assert
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByText('priya@mws.ai')).toBeInTheDocument();
  });

  it('AccountMenu — Sign out — calls logout', async () => {
    // Arrange
    const logout = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(<AccountMenu />, { auth: buildAuth({ logout }) });

    // Act
    await user.click(screen.getByRole('button', { name: 'Account — Priya Raman' }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));

    // Assert
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('AccountMenu — no user — renders nothing', () => {
    const { container } = renderWithProviders(<AccountMenu />, {
      auth: buildAuth({ isAuthenticated: false, user: null }),
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('AccountMenu — no axe violations (closed and open)', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<AccountMenu />);
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole('button', { name: 'Account — Priya Raman' }));
    expect(await axe(container)).toHaveNoViolations();
  });
});

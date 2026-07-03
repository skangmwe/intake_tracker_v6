import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { House } from '@phosphor-icons/react';

import { renderWithProviders } from '@/test-utils';

import { NavItem } from './NavItem';

describe('NavItem', () => {
  it('NavItem — renders a link with the label as its accessible name', () => {
    renderWithProviders(<NavItem to="/requests" icon={House} label="Requests" />, { route: '/' });
    expect(screen.getByRole('link', { name: 'Requests' })).toHaveAttribute('href', '/requests');
  });

  it('NavItem — active route — marks aria-current="page"', () => {
    renderWithProviders(<NavItem to="/requests" icon={House} label="Requests" />, { route: '/requests' });
    expect(screen.getByRole('link', { name: 'Requests' })).toHaveAttribute('aria-current', 'page');
  });

  it('NavItem — inactive route — has no aria-current', () => {
    renderWithProviders(<NavItem to="/requests" icon={House} label="Requests" />, { route: '/' });
    expect(screen.getByRole('link', { name: 'Requests' })).not.toHaveAttribute('aria-current');
  });

  it('NavItem — clicked — calls onNavigate (drawer close)', async () => {
    // Arrange
    const onNavigate = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(<NavItem to="/requests" icon={House} label="Requests" onNavigate={onNavigate} />, {
      route: '/',
    });

    // Act
    await user.click(screen.getByRole('link', { name: 'Requests' }));

    // Assert
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('NavItem — no axe violations', async () => {
    const { container } = renderWithProviders(<NavItem to="/requests" icon={House} label="Requests" />, {
      route: '/requests',
    });
    expect(await axe(container)).toHaveNoViolations();
  });
});

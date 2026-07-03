import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { buildMe } from '@/test-utils';

import { App } from './App';

describe('App', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    document.documentElement.setAttribute('data-theme', 'light');
    // Dev auth mode (no __APP_CONFIG__); the shell's /users/me call is mocked.
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => buildMe() }) as unknown as typeof fetch;
  });

  it('App — renders the app shell and the home landing page for "/"', async () => {
    // Act
    render(<App />);

    // Assert
    expect(
      await screen.findByRole('complementary', { name: 'Application navigation' }),
    ).toBeInTheDocument();
    // "Home" is both the nav item and the top-bar title for the landing route.
    expect(screen.getAllByText('Home').length).toBeGreaterThan(0);
  });

  it('App — no axe violations on the landing route', async () => {
    // Arrange
    const { container } = render(<App />);
    await screen.findByRole('complementary', { name: 'Application navigation' });

    // Assert
    expect(await axe(container)).toHaveNoViolations();
  });
});

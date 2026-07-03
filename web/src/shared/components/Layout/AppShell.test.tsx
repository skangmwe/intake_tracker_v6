import { Route, Routes } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { buildMe, renderWithProviders } from '@/test-utils';

import { AppShell } from './AppShell';

function renderShell(seedMe = buildMe()) {
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<div>home body</div>} />
      </Route>
    </Routes>,
    { route: '/', seedMe },
  );
}

describe('AppShell', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.setAttribute('data-theme', 'light');
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 }) as unknown as typeof fetch;
  });

  it('AppShell — renders the sidebar, top bar title, and routed content', () => {
    renderShell();
    expect(screen.getByRole('complementary', { name: 'Application navigation' })).toBeInTheDocument();
    // "Home" appears in both the sidebar nav and the top-bar title; scope to the top bar.
    expect(within(screen.getByRole('banner')).getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('home body')).toBeInTheDocument();
  });

  it('AppShell — theme toggle — flips the document theme', async () => {
    // Arrange
    const user = userEvent.setup();
    renderShell();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    // Act
    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));

    // Assert
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('AppShell — hamburger opens the drawer, Escape closes it', async () => {
    // Arrange
    const user = userEvent.setup();
    renderShell();
    const sidebar = screen.getByRole('complementary', { name: 'Application navigation' });
    expect(sidebar).toHaveAttribute('data-open', 'false');

    // Act — open
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(sidebar).toHaveAttribute('data-open', 'true');

    // Act — Escape closes (focus trap)
    await user.keyboard('{Escape}');

    // Assert
    expect(sidebar).toHaveAttribute('data-open', 'false');
  });

  it('AppShell — server theme dark — reconciles the painted theme once', () => {
    // Arrange — a fresh device paints light, but the server preference is dark.
    document.documentElement.setAttribute('data-theme', 'light');

    // Act
    renderShell(buildMe({ user: { ...buildMe().user, theme: 'dark' } }));

    // Assert
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('AppShell — no axe violations', async () => {
    const { container } = renderShell();
    expect(await axe(container)).toHaveNoViolations();
  });
});

// SideNavLayout — the shared settings-style side list. Covers the labelled nav landmark, the
// surface links, the active-link marker, and the content swap via Outlet. jest-axe runs on the
// distinct active states (web-testing.md).

import { axe } from 'jest-axe';
import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

import { renderWithProviders } from '@/test-utils';

import { SideNavLayout, type SideNavItem } from './SideNavLayout';

const ITEMS: SideNavItem[] = [
  { to: '/area/one', label: 'One' },
  { to: '/area/two', label: 'Two' },
  { to: '/area/three', label: 'Three' },
];

function renderLayout(route = '/area/one') {
  return renderWithProviders(
    <Routes>
      <Route path="/area" element={<SideNavLayout navLabel="Area sections" items={ITEMS} />}>
        <Route path="one" element={<div>One surface</div>} />
        <Route path="two" element={<div>Two surface</div>} />
        <Route path="three" element={<div>Three surface</div>} />
      </Route>
    </Routes>,
    { route },
  );
}

describe('SideNavLayout', () => {
  it('SideNavLayout — renders the labelled surface list and the active surface', async () => {
    // Arrange + Act
    const { container } = renderLayout();

    // Assert
    const nav = screen.getByRole('navigation', { name: 'Area sections' });
    expect(within(nav).getAllByRole('link')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'One' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('One surface')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('SideNavLayout — a different route — marks that link current and swaps the content', async () => {
    // Arrange + Act
    const { container } = renderLayout('/area/three');

    // Assert
    expect(screen.getByRole('link', { name: 'Three' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'One' })).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Three surface')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

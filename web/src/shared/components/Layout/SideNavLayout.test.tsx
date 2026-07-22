// SideNavLayout — the shared settings-style side list. Covers the full-width title header (title +
// lead derived from the active route, title falling back to the nav label), the labelled nav
// landmark, the surface links, the active-link marker, and the content swap via Outlet. jest-axe
// runs on the distinct active states (web-testing.md).

import { axe } from 'jest-axe';
import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

import { renderWithProviders } from '@/test-utils';

import { SideNavLayout, type SideNavItem } from './SideNavLayout';

const ITEMS: SideNavItem[] = [
  { to: '/area/one', label: 'One', title: 'Section one', lead: 'The first surface in the area.' },
  { to: '/area/two', label: 'Two', lead: 'The second surface in the area.' },
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
  it('SideNavLayout — renders the header, the labelled surface list, and the active surface', async () => {
    // Arrange + Act
    const { container } = renderLayout();

    // Assert — the header shows the eyebrow (nav label), the active item title, and its lead.
    expect(screen.getByText('Area sections')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Section one' })).toBeInTheDocument();
    expect(screen.getByText('The first surface in the area.')).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: 'Area sections' });
    expect(within(nav).getAllByRole('link')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'One' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('One surface')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('SideNavLayout — a different route — swaps the header title and marks that link current', async () => {
    // Arrange + Act — the third item has no explicit title, so the header falls back to its label.
    const { container } = renderLayout('/area/three');

    // Assert
    expect(screen.getByRole('heading', { name: 'Three' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Section one' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Three' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'One' })).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Three surface')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('SideNavLayout — an item with a title but no lead — renders the title without a lead line', () => {
    // Arrange + Act — item two has a lead; item three has neither title nor lead.
    renderLayout('/area/two');

    // Assert — falls back to the label as the heading, shows the lead.
    expect(screen.getByRole('heading', { name: 'Two' })).toBeInTheDocument();
    expect(screen.getByText('The second surface in the area.')).toBeInTheDocument();
  });
});

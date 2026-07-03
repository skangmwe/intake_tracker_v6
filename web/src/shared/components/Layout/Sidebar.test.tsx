import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { renderWithProviders } from '@/test-utils';

import { Sidebar } from './Sidebar';

function renderSidebar(props: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  return renderWithProviders(
    <Sidebar
      open={false}
      collapsed={false}
      memberships={[]}
      onToggleCollapse={jest.fn()}
      onNavigate={jest.fn()}
      {...props}
    />,
    { route: '/' },
  );
}

describe('Sidebar', () => {
  it('Sidebar — renders the identity lockup and grouped nav sections', () => {
    renderSidebar();
    expect(screen.getByRole('img', { name: 'McDermott' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Workspace' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lifecycle & gates' })).toBeInTheDocument();
  });

  it('Sidebar — collapse control — calls onToggleCollapse', async () => {
    // Arrange
    const onToggleCollapse = jest.fn();
    const user = userEvent.setup();
    renderSidebar({ onToggleCollapse });

    // Act
    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));

    // Assert
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('Sidebar — collapsed — hides the lockup name and offers to expand', () => {
    renderSidebar({ collapsed: true });
    expect(screen.queryByText('AI Solutions Tracker')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toBeInTheDocument();
  });

  it('Sidebar — open drawer — sets data-open on the aside', () => {
    renderSidebar({ open: true });
    expect(screen.getByRole('complementary', { name: 'Application navigation' })).toHaveAttribute(
      'data-open',
      'true',
    );
  });

  it('Sidebar — no axe violations (expanded and collapsed)', async () => {
    const expanded = renderSidebar();
    expect(await axe(expanded.container)).toHaveNoViolations();
    const collapsed = renderSidebar({ collapsed: true });
    expect(await axe(collapsed.container)).toHaveNoViolations();
  });
});

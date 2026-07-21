import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { WorkspaceId } from '@shared/types';

import { buildMembership as membership } from '@/test-utils';

import { WorkspaceSwitcher } from './WorkspaceSwitcher';

describe('WorkspaceSwitcher', () => {
  it('WorkspaceSwitcher — with memberships — shows the first as current and is collapsed', () => {
    render(<WorkspaceSwitcher memberships={[membership()]} />);
    const trigger = screen.getByRole('button', { name: /Switch workspace/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('AI Solutions');
  });

  it('WorkspaceSwitcher — no memberships — reads "No workspace"', () => {
    render(<WorkspaceSwitcher memberships={[]} />);
    expect(screen.getByRole('button', { name: /Switch workspace/ })).toHaveTextContent('No workspace');
  });

  it('WorkspaceSwitcher — opened — lists the memberships in a menu', async () => {
    // Arrange
    const user = userEvent.setup();
    render(
      <WorkspaceSwitcher
        memberships={[
          membership(),
          membership({ workspaceId: 'ws-2' as WorkspaceId, workspaceName: 'Litigation', workspaceKind: 'pg-dept' }),
        ]}
      />,
    );

    // Act
    await user.click(screen.getByRole('button', { name: /Switch workspace/ }));

    // Assert
    const menu = screen.getByRole('menu', { name: 'Your workspaces' });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Litigation/ })).toBeInTheDocument();
  });

  it('WorkspaceSwitcher — opened — hides the PG/Dept template from the list', async () => {
    // Arrange
    const user = userEvent.setup();
    render(
      <WorkspaceSwitcher
        memberships={[
          membership(),
          membership({
            workspaceId: 'ws-tmpl' as WorkspaceId,
            workspaceName: 'PG / Department Template',
            workspaceKind: 'pg-dept-template',
          }),
        ]}
      />,
    );

    // Act
    await user.click(screen.getByRole('button', { name: /Switch workspace/ }));

    // Assert — template is filtered out; only the real workspace remains.
    expect(screen.getByRole('menuitem', { name: /AI Solutions/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Template/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
  });

  it('WorkspaceSwitcher — opened with no memberships — shows the empty note', async () => {
    const user = userEvent.setup();
    render(<WorkspaceSwitcher memberships={[]} />);
    await user.click(screen.getByRole('button', { name: /Switch workspace/ }));
    expect(screen.getByText(/not a member of any workspace/i)).toBeInTheDocument();
  });

  it('WorkspaceSwitcher — no axe violations (closed and open)', async () => {
    // Arrange
    const user = userEvent.setup();
    const { container } = render(<WorkspaceSwitcher memberships={[membership()]} />);
    expect(await axe(container)).toHaveNoViolations();

    // Act — open, then re-check. The menu is portalled outside `container`, so axe it directly.
    // (Scoping to the menu also avoids the page-level "region" landmark rule, which is the
    // AppShell's responsibility, not this isolated component's.)
    await user.click(screen.getByRole('button', { name: /Switch workspace/ }));

    // Assert
    expect(await axe(screen.getByRole('menu', { name: 'Your workspaces' }))).toHaveNoViolations();
  });
});

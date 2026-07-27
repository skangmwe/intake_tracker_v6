import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { WorkspaceId } from '@shared/types';

import { ME_QUERY_KEY } from '@/features/users/useMe';
import { ActiveWorkspaceProvider, ACTIVE_WORKSPACE_STORAGE_KEY } from '@/shared/workspace/ActiveWorkspaceContext';
import { buildMe, buildMembership } from '@/test-utils';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

const memberships = [
  buildMembership({ workspaceId: 'ws-ai' as WorkspaceId, workspaceName: 'AI Solutions', workspaceKind: 'ai-solutions' }),
  buildMembership({ workspaceId: 'ws-lit' as WorkspaceId, workspaceName: 'Litigation', workspaceKind: 'pg-dept' }),
];

function renderSwitcher(memberList: typeof memberships = memberships) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(ME_QUERY_KEY, buildMe({ memberships: memberList }));
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ActiveWorkspaceProvider>{children}</ActiveWorkspaceProvider>
      </QueryClientProvider>
    );
  }
  return render(<WorkspaceSwitcher memberships={memberList} />, { wrapper: Wrapper });
}

describe('WorkspaceSwitcher', () => {
  beforeEach(() => localStorage.clear());

  it('WorkspaceSwitcher — default — shows the ai-solutions hub as current', () => {
    // Arrange / Act
    renderSwitcher();

    // Assert
    const trigger = screen.getByRole('button', { name: /AI Solutions/ });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('WorkspaceSwitcher — select another workspace — sets it active and persists it', async () => {
    // Arrange
    const user = userEvent.setup();
    renderSwitcher();
    await user.click(screen.getByRole('button', { name: /Switch workspace/ }));

    // Act
    const menu = screen.getByRole('menu', { name: /Your workspaces/ });
    await user.click(within(menu).getByRole('menuitem', { name: /Litigation/ }));

    // Assert
    expect(screen.getByRole('button', { name: /Litigation/ })).toBeInTheDocument();
    expect(localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBe('ws-lit');
  });

  it('WorkspaceSwitcher — opened — hides the PG/Dept template from the list', async () => {
    // Arrange
    const user = userEvent.setup();
    const withTemplate = [
      ...memberships,
      buildMembership({
        workspaceId: 'ws-tmpl' as WorkspaceId,
        workspaceName: 'PG Template',
        workspaceKind: 'pg-dept-template',
      }),
    ];
    renderSwitcher(withTemplate);
    await user.click(screen.getByRole('button', { name: /Switch workspace/ }));

    // Act
    const menu = screen.getByRole('menu', { name: /Your workspaces/ });

    // Assert — template is filtered out; only the two real workspaces remain.
    expect(within(menu).queryByRole('menuitem', { name: /PG Template/ })).not.toBeInTheDocument();
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2);
  });

  it('WorkspaceSwitcher — no memberships — reads "No workspace" and shows the empty note', async () => {
    // Arrange
    const user = userEvent.setup();
    renderSwitcher([]);

    // Assert (closed)
    expect(screen.getByRole('button', { name: /Switch workspace/ })).toHaveTextContent('No workspace');

    // Act
    await user.click(screen.getByRole('button', { name: /Switch workspace/ }));

    // Assert (open)
    expect(screen.getByText(/not a member of any workspace/i)).toBeInTheDocument();
  });

  it('WorkspaceSwitcher — no axe violations (closed and open)', async () => {
    // Arrange
    const user = userEvent.setup();
    const { container } = renderSwitcher();

    // Assert (closed)
    expect(await axe(container)).toHaveNoViolations();

    // Act — open, then re-check.
    await user.click(screen.getByRole('button', { name: /Switch workspace/ }));

    // Assert (open)
    expect(await axe(container)).toHaveNoViolations();
  });
});

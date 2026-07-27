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

function renderSwitcher() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(ME_QUERY_KEY, buildMe({ memberships }));
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ActiveWorkspaceProvider>{children}</ActiveWorkspaceProvider>
      </QueryClientProvider>
    );
  }
  return render(<WorkspaceSwitcher memberships={memberships} />, { wrapper: Wrapper });
}

describe('WorkspaceSwitcher', () => {
  beforeEach(() => localStorage.clear());

  it('WorkspaceSwitcher — default — shows the ai-solutions hub as current', () => {
    // Arrange / Act
    renderSwitcher();

    // Assert
    expect(screen.getByRole('button', { name: /AI Solutions/ })).toBeInTheDocument();
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

  it('WorkspaceSwitcher — open menu — has no axe violations', async () => {
    // Arrange
    const user = userEvent.setup();
    const { container } = renderSwitcher();

    // Act
    await user.click(screen.getByRole('button', { name: /Switch workspace/ }));

    // Assert
    expect(await axe(container)).toHaveNoViolations();
  });
});

import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import type { MeDto, WorkspaceId } from '@shared/types';

import { ME_QUERY_KEY } from '@/features/users/useMe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  ACTIVE_WORKSPACE_STORAGE_KEY,
  ActiveWorkspaceProvider,
  useActiveWorkspace,
  useActiveWorkspaceId,
} from './ActiveWorkspaceContext';
import { buildMe, buildMembership } from '@/test-utils';

function wrapperFor(me: MeDto | undefined) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (me) queryClient.setQueryData(ME_QUERY_KEY, me);
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ActiveWorkspaceProvider>{children}</ActiveWorkspaceProvider>
      </QueryClientProvider>
    );
  };
}

describe('ActiveWorkspaceContext', () => {
  beforeEach(() => localStorage.clear());

  it('useActiveWorkspaceId — no stored id — defaults to the ai-solutions hub', () => {
    // Arrange
    const me = buildMe({
      memberships: [
        buildMembership({ workspaceId: 'ws-dept' as WorkspaceId, workspaceKind: 'pg-dept' }),
        buildMembership({ workspaceId: 'ws-ai' as WorkspaceId, workspaceKind: 'ai-solutions' }),
      ],
    });

    // Act
    const { result } = renderHook(() => useActiveWorkspaceId(), { wrapper: wrapperFor(me) });

    // Assert
    expect(result.current).toBe('ws-ai');
  });

  it('useActiveWorkspace — setActiveWorkspaceId — updates state and writes localStorage', () => {
    // Arrange
    const me = buildMe({
      memberships: [
        buildMembership({ workspaceId: 'ws-ai' as WorkspaceId, workspaceKind: 'ai-solutions' }),
        buildMembership({ workspaceId: 'ws-dept' as WorkspaceId, workspaceKind: 'pg-dept' }),
      ],
    });
    const { result } = renderHook(() => useActiveWorkspace(), { wrapper: wrapperFor(me) });

    // Act
    act(() => result.current.setActiveWorkspaceId('ws-dept' as WorkspaceId));

    // Assert
    expect(result.current.activeWorkspaceId).toBe('ws-dept');
    expect(localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBe('ws-dept');
  });

  it('useActiveWorkspaceId — valid stored id — uses it over the default', () => {
    // Arrange
    localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, 'ws-dept');
    const me = buildMe({
      memberships: [
        buildMembership({ workspaceId: 'ws-ai' as WorkspaceId, workspaceKind: 'ai-solutions' }),
        buildMembership({ workspaceId: 'ws-dept' as WorkspaceId, workspaceKind: 'pg-dept' }),
      ],
    });

    // Act
    const { result } = renderHook(() => useActiveWorkspaceId(), { wrapper: wrapperFor(me) });

    // Assert
    expect(result.current).toBe('ws-dept');
  });

  it('useActiveWorkspaceId — stored id not in memberships — falls back to the default', () => {
    // Arrange
    localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, 'ws-gone');
    const me = buildMe({
      memberships: [buildMembership({ workspaceId: 'ws-ai' as WorkspaceId, workspaceKind: 'ai-solutions' })],
    });

    // Act
    const { result } = renderHook(() => useActiveWorkspaceId(), { wrapper: wrapperFor(me) });

    // Assert
    expect(result.current).toBe('ws-ai');
  });

  it('useActiveWorkspaceId — only a pg-dept-template membership — returns null (template not switchable)', () => {
    // Arrange
    const me = buildMe({
      memberships: [
        buildMembership({ workspaceId: 'ws-tmpl' as WorkspaceId, workspaceKind: 'pg-dept-template' }),
      ],
    });

    // Act
    const { result } = renderHook(() => useActiveWorkspaceId(), { wrapper: wrapperFor(me) });

    // Assert
    expect(result.current).toBeNull();
  });

  it('useActiveWorkspace — used with no provider — throws', () => {
    // Arrange / Act / Assert
    expect(() => renderHook(() => useActiveWorkspace())).toThrow(/ActiveWorkspaceProvider/);
  });
});

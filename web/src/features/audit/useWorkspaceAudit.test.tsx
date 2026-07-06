// Tests for the workspace-audit data hook — query enablement (needs a workspace) and that it calls
// the api with the workspace + query. The api is mocked; a local QueryClient wrapper hosts the hook
// (web-testing.md — renderHook keeps a local wrapper). Logic-only hook: no DOM, no axe.

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { AuditLogQuery, WorkspaceId } from '@shared/types';

import * as api from './api';
import { useWorkspaceAudit } from './useWorkspaceAudit';

jest.mock('./api');
const mockedApi = api as jest.Mocked<typeof api>;

const WORKSPACE_ID = 'ws-1' as WorkspaceId;
const QUERY: AuditLogQuery = { page: 1, pageSize: 25 };

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('useWorkspaceAudit — no workspace — stays disabled and does not fetch', () => {
  // Act
  renderHook(() => useWorkspaceAudit(undefined, QUERY), { wrapper: wrapper() });

  // Assert
  expect(mockedApi.queryWorkspaceAudit).not.toHaveBeenCalled();
});

it('useWorkspaceAudit — with a workspace — fetches with the workspace and query', async () => {
  // Arrange
  mockedApi.queryWorkspaceAudit.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 25 });

  // Act
  const { result } = renderHook(() => useWorkspaceAudit(WORKSPACE_ID, QUERY), { wrapper: wrapper() });

  // Assert
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockedApi.queryWorkspaceAudit).toHaveBeenCalledWith(WORKSPACE_ID, QUERY, expect.anything());
});

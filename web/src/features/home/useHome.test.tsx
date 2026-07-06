// Tests for the useHome data hook — query enablement (disabled with no active workspace) and the
// success path. The api is mocked; a local QueryClient wrapper hosts the hook (web-testing.md).

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { HomeDto, WorkspaceId } from '@shared/types';

import * as api from './api';
import { useHome } from './useHome';

jest.mock('./api');
const mockedApi = api as jest.Mocked<typeof api>;

const WORKSPACE_ID = 'ws-1' as WorkspaceId;

function emptyHome(): HomeDto {
  return {
    workspaceId: WORKSPACE_ID,
    decisions: [],
    decisionCount: 0,
    work: [],
    workCount: 0,
    activity: [],
    sinceLastSeenAt: null,
    triage: [],
    triageCount: 0,
    pinnedAnnouncements: [],
  };
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('useHome — no active workspace — stays disabled and does not fetch', () => {
  // Act
  renderHook(() => useHome(null), { wrapper: wrapper() });

  // Assert
  expect(mockedApi.fetchHome).not.toHaveBeenCalled();
});

it('useHome — with a workspace — fetches the composite payload', async () => {
  // Arrange
  mockedApi.fetchHome.mockResolvedValue(emptyHome());

  // Act
  const { result } = renderHook(() => useHome(WORKSPACE_ID), { wrapper: wrapper() });

  // Assert
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockedApi.fetchHome).toHaveBeenCalledWith(WORKSPACE_ID, expect.anything());
});

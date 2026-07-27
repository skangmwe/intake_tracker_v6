import { waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { WorkspaceListRow, WorkspaceId } from '@shared/types';

import { fetchWorkspacesList } from './api';
import { useWorkspacesList } from './useWorkspacesList';

jest.mock('./api');
const mockedFetch = fetchWorkspacesList as jest.MockedFunction<typeof fetchWorkspacesList>;

const row: WorkspaceListRow = {
  id: '00000000-0000-4000-8000-0000000000aa' as WorkspaceId,
  name: 'Litigation',
  kind: 'pg-dept',
  prefix: 'LIT',
  ownerDisplayName: 'Grace Lin',
  memberCount: 64,
  provisionedAt: '2026-07-01T00:00:00Z',
  isArchived: false,
};

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => jest.clearAllMocks());

it('useWorkspacesList — resolves — returns the rows', async () => {
  // Arrange
  mockedFetch.mockResolvedValue([row]);

  // Act
  const { result } = renderHook(() => useWorkspacesList(), { wrapper });

  // Assert
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual([row]);
});

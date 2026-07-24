// Tests for the platform broadcast data hooks — the workspaces + list reads and the create / update /
// retire mutations. The platform api is mocked; a local QueryClient wrapper hosts the hooks
// (web-testing.md — renderHook keeps a local wrapper).

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as platformApi from './platformApi';
import {
  useCreatePlatformBroadcast,
  usePlatformAnnouncements,
  usePlatformWorkspaces,
  useRetirePlatformBroadcast,
  useUpdatePlatformBroadcast,
} from './usePlatformAnnouncements';

jest.mock('./platformApi');
const mockedApi = platformApi as jest.Mocked<typeof platformApi>;

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('usePlatformWorkspaces — fetches the workspace target list', async () => {
  // Arrange
  mockedApi.fetchPlatformWorkspaces.mockResolvedValue([]);

  // Act
  const { result } = renderHook(() => usePlatformWorkspaces(), { wrapper: wrapper() });

  // Assert
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockedApi.fetchPlatformWorkspaces).toHaveBeenCalled();
});

it('usePlatformAnnouncements — fetches the grouped broadcast list in one page', async () => {
  // Arrange
  mockedApi.queryPlatformAnnouncements.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 100 });

  // Act
  const { result } = renderHook(() => usePlatformAnnouncements(), { wrapper: wrapper() });

  // Assert
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockedApi.queryPlatformAnnouncements).toHaveBeenCalledWith(
    { page: 1, pageSize: 100 },
    expect.anything(),
  );
});

it('useCreatePlatformBroadcast — posts the broadcast', async () => {
  // Arrange
  mockedApi.createPlatformBroadcast.mockResolvedValue({ broadcastId: 'b1', workspaceCount: 2 });

  // Act
  const { result } = renderHook(() => useCreatePlatformBroadcast(), { wrapper: wrapper() });
  result.current.mutate({ title: 'T', body: 'B', status: 'Active', target: { kind: 'all' } });

  // Assert
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockedApi.createPlatformBroadcast).toHaveBeenCalled();
});

it('useUpdatePlatformBroadcast — patches the broadcast', async () => {
  // Arrange
  mockedApi.updatePlatformBroadcast.mockResolvedValue(undefined);

  // Act
  const { result } = renderHook(() => useUpdatePlatformBroadcast(), { wrapper: wrapper() });
  result.current.mutate({
    broadcastId: 'b1',
    request: { title: 'New', body: 'B', pinned: false, status: 'Active' },
  });

  // Assert
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockedApi.updatePlatformBroadcast).toHaveBeenCalledWith(
    'b1',
    expect.objectContaining({ title: 'New' }),
  );
});

it('useRetirePlatformBroadcast — retires the broadcast', async () => {
  // Arrange
  mockedApi.retirePlatformBroadcast.mockResolvedValue(undefined);

  // Act
  const { result } = renderHook(() => useRetirePlatformBroadcast(), { wrapper: wrapper() });
  result.current.mutate('b1');

  // Assert
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockedApi.retirePlatformBroadcast).toHaveBeenCalledWith('b1');
});

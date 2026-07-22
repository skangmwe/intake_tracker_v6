// Tests for the platform schema hooks (S34). The api module is mocked at the boundary; the hooks'
// own behaviour (enable/disable gating, query keys) is what's under test.

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { WorkspaceId } from '@shared/types';

import {
  fetchPlatformObjects,
  fetchPlatformRelationships,
  fetchPlatformWorkspaces,
} from './platformSchema';
import {
  platformRelationshipsQueryKey,
  usePlatformObjects,
  usePlatformRelationships,
  usePlatformWorkspaces,
} from './usePlatformSchema';

jest.mock('./platformSchema');
const mockedObjects = fetchPlatformObjects as jest.MockedFunction<typeof fetchPlatformObjects>;
const mockedWorkspaces = fetchPlatformWorkspaces as jest.MockedFunction<
  typeof fetchPlatformWorkspaces
>;
const mockedRelationships = fetchPlatformRelationships as jest.MockedFunction<
  typeof fetchPlatformRelationships
>;

const WORKSPACE = '1a150000-0000-4000-8000-000000000001' as WorkspaceId;

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedObjects.mockResolvedValue([]);
  mockedWorkspaces.mockResolvedValue([]);
  mockedRelationships.mockResolvedValue([]);
});

describe('usePlatformSchema hooks', () => {
  it('usePlatformObjects — fetches when enabled (default)', async () => {
    const { result } = renderHook(() => usePlatformObjects(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedObjects).toHaveBeenCalled();
  });

  it('usePlatformObjects — does not fetch when disabled', () => {
    renderHook(() => usePlatformObjects(false), { wrapper: makeWrapper() });
    expect(mockedObjects).not.toHaveBeenCalled();
  });

  it('usePlatformWorkspaces — fetches when enabled (default)', async () => {
    const { result } = renderHook(() => usePlatformWorkspaces(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedWorkspaces).toHaveBeenCalled();
  });

  it('usePlatformRelationships — fetches for the given workspace', async () => {
    const { result } = renderHook(() => usePlatformRelationships(WORKSPACE), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedRelationships).toHaveBeenCalledWith(WORKSPACE, expect.anything());
  });

  it('usePlatformRelationships — disabled (never fetches) when no workspace is selected', () => {
    renderHook(() => usePlatformRelationships(null), { wrapper: makeWrapper() });
    expect(mockedRelationships).not.toHaveBeenCalled();
  });

  it('platformRelationshipsQueryKey — namespaces by workspace', () => {
    expect(platformRelationshipsQueryKey(WORKSPACE)).toEqual(['platform-relationships', WORKSPACE]);
  });
});

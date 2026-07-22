// Tests for the platform schema hooks (S34). The api module is mocked at the boundary; the hooks'
// own behaviour (enable/disable gating, query keys) is what's under test.

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import { fetchPlatformObjects, fetchPlatformRelationships } from './platformSchema';
import { usePlatformObjects, usePlatformRelationships } from './usePlatformSchema';

jest.mock('./platformSchema');
const mockedObjects = fetchPlatformObjects as jest.MockedFunction<typeof fetchPlatformObjects>;
const mockedRelationships = fetchPlatformRelationships as jest.MockedFunction<
  typeof fetchPlatformRelationships
>;

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

  it('usePlatformRelationships — fetches when enabled (default)', async () => {
    const { result } = renderHook(() => usePlatformRelationships(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedRelationships).toHaveBeenCalled();
  });

  it('usePlatformRelationships — does not fetch when disabled', () => {
    renderHook(() => usePlatformRelationships(false), { wrapper: makeWrapper() });
    expect(mockedRelationships).not.toHaveBeenCalled();
  });
});

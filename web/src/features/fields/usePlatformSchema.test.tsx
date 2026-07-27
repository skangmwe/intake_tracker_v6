// Tests for the platform schema hooks (S34). The api module is mocked at the boundary; the hooks'
// own behaviour (enable/disable gating, query keys) is what's under test.

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import {
  fetchPlatformObjectFields,
  fetchPlatformObjects,
  fetchPlatformRelationships,
} from './platformSchema';
import { usePlatformObjectFields, usePlatformObjects, usePlatformRelationships } from './usePlatformSchema';

jest.mock('./platformSchema');
const mockedObjects = fetchPlatformObjects as jest.MockedFunction<typeof fetchPlatformObjects>;
const mockedRelationships = fetchPlatformRelationships as jest.MockedFunction<
  typeof fetchPlatformRelationships
>;
const mockedObjectFields = fetchPlatformObjectFields as jest.MockedFunction<
  typeof fetchPlatformObjectFields
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
  mockedObjectFields.mockResolvedValue([]);
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

  // ─── Fields on a Global custom object (SP3b Slice 2a, Task 6) ────────────────────────────────
  // The mutation hooks (create/update/delete) are covered end-to-end via PlatformFieldsCatalogTab's
  // tests (component-level, real invalidation effects) — mirrors how the sibling object mutation
  // hooks are covered only through PlatformObjectsTab, not in isolation here.

  it('usePlatformObjectFields — fetches when given an objectKey', async () => {
    const { result } = renderHook(() => usePlatformObjectFields('vendor'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedObjectFields).toHaveBeenCalled();
  });

  it('usePlatformObjectFields — does not fetch when objectKey is null', () => {
    renderHook(() => usePlatformObjectFields(null), { wrapper: makeWrapper() });
    expect(mockedObjectFields).not.toHaveBeenCalled();
  });
});

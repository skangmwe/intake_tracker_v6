// Branch coverage for the platform-admin query hooks: the `enabled` gate (a non-admin must not fire a
// guaranteed-403 fetch) and the disabled query-key path. The feature api + users api are mocked at the
// boundary so nothing hits the network.

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { fetchAccessGrants, fetchCrossingMap, fetchRoleLabels, queryFirmWideAudit } from './api';
import { useAccessGrants } from './useAccessGrants';
import { useCrossingMap } from './useCrossingMap';
import { useFirmWideAudit } from './useFirmWideAudit';
import { useRoleLabels } from './useRoleLabels';

jest.mock('./api');
const mockedCrossing = fetchCrossingMap as jest.MockedFunction<typeof fetchCrossingMap>;
const mockedRoleLabels = fetchRoleLabels as jest.MockedFunction<typeof fetchRoleLabels>;
const mockedGrants = fetchAccessGrants as jest.MockedFunction<typeof fetchAccessGrants>;
const mockedAudit = queryFirmWideAudit as jest.MockedFunction<typeof queryFirmWideAudit>;

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => jest.clearAllMocks());

describe('platform-admin hooks — enabled gate', () => {
  it('useCrossingMap(false) — does not fetch', async () => {
    const { result } = renderHook(() => useCrossingMap(false), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(mockedCrossing).not.toHaveBeenCalled();
  });

  it('useRoleLabels(false) — does not fetch', async () => {
    const { result } = renderHook(() => useRoleLabels(false), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(mockedRoleLabels).not.toHaveBeenCalled();
  });

  it('useAccessGrants(false) — does not fetch', async () => {
    const { result } = renderHook(() => useAccessGrants(false), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(mockedGrants).not.toHaveBeenCalled();
  });

  it('useFirmWideAudit(false) — does not fetch and uses the disabled key', async () => {
    const { result } = renderHook(() => useFirmWideAudit(false, { page: 1, pageSize: 25 }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it('useCrossingMap(true) — fetches when enabled', async () => {
    mockedCrossing.mockResolvedValue([]);
    const { result } = renderHook(() => useCrossingMap(true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedCrossing).toHaveBeenCalledTimes(1);
  });
});

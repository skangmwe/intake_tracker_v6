// Tests for usePlatformAdmin — resolves the additive Platform-admin grant from /users/me. The users
// api (fetchMe) is mocked so the seeded query stays resolved.

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { buildMe } from '@/test-utils';
import { fetchMe } from '@/features/users/api';
import { ME_QUERY_KEY } from '@/features/users/useMe';

import { usePlatformAdmin } from './usePlatformAdmin';

jest.mock('@/features/users/api');
const mockedFetchMe = fetchMe as jest.MockedFunction<typeof fetchMe>;

function wrapperFor(isPlatformAdmin: boolean) {
  const me = buildMe({ isPlatformAdmin });
  mockedFetchMe.mockResolvedValue(me);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(ME_QUERY_KEY, me);
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => jest.clearAllMocks());

describe('usePlatformAdmin', () => {
  it('usePlatformAdmin — grant present — reports isPlatformAdmin true', async () => {
    const { result } = renderHook(() => usePlatformAdmin(), { wrapper: wrapperFor(true) });
    await waitFor(() => expect(result.current.isPlatformAdmin).toBe(true));
  });

  it('usePlatformAdmin — no grant — reports isPlatformAdmin false', async () => {
    const { result } = renderHook(() => usePlatformAdmin(), { wrapper: wrapperFor(false) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isPlatformAdmin).toBe(false);
  });

  it('usePlatformAdmin — while /users/me is loading — reports false (the undefined-me fallback)', () => {
    // A never-resolving fetchMe and no seeded data keeps the query pending.
    mockedFetchMe.mockReturnValue(new Promise(() => undefined));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => usePlatformAdmin(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isPlatformAdmin).toBe(false);
  });
});

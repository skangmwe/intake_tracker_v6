// Unit tests for the similar-requests nudge — the `findSimilarRequests` API call and the
// `useSimilarRequests` hook. apiFetch is mocked at the HTTP boundary so the real hook + real API
// function are both exercised (web-testing.md). A local QueryClient wrapper hosts the hook.

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { SimilarRequestDto, WorkspaceId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import { findSimilarRequests } from './api';
import { useSimilarRequests } from './useRequests';

jest.mock('@/shared/http/apiClient');

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const WS = 'ws-1' as WorkspaceId;
const MATCH: SimilarRequestDto = {
  id: 'AIS-00000009' as SimilarRequestDto['id'],
  name: 'Contract clause finder',
  stage: 'build',
  origin: 'AI Solutions',
};

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { Wrapper };
}

describe('findSimilarRequests', () => {
  beforeEach(() => jest.clearAllMocks());

  it('findSimilarRequests — GETs the workspace similar path with the query', () => {
    mockedFetch.mockResolvedValue([] as never);
    findSimilarRequests(WS, 'contract');
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/requests/similar?query=contract', {});
  });

  it('findSimilarRequests — passes the abort signal when provided', () => {
    mockedFetch.mockResolvedValue([] as never);
    const controller = new AbortController();
    findSimilarRequests(WS, 'contract', controller.signal);
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/requests/similar?query=contract', {
      signal: controller.signal,
    });
  });
});

describe('useSimilarRequests', () => {
  beforeEach(() => jest.clearAllMocks());

  it('useSimilarRequests — queries once the term clears the minimum length', async () => {
    mockedFetch.mockResolvedValue([MATCH] as never);
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useSimilarRequests(WS, 'contract clause'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });

  it('useSimilarRequests — stays idle for a too-short term', () => {
    mockedFetch.mockResolvedValue([] as never);
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useSimilarRequests(WS, 'ab'), { wrapper: Wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('useSimilarRequests — stays idle with no workspace', () => {
    mockedFetch.mockResolvedValue([] as never);
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useSimilarRequests(undefined, 'contract clause'), { wrapper: Wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});

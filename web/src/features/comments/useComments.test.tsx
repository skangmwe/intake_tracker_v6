// Unit tests for the comments hooks. The API boundary is mocked; a local QueryClient wrapper hosts
// the hooks (web-testing.md — renderHook keeps a local wrapper).

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { RecordId } from '@shared/types';

import * as api from './api';
import { threadKey, useThread, usePostComment } from './useComments';

jest.mock('./api');

const mockedApi = api as jest.Mocked<typeof api>;
const RECORD = 'AIS-00000001' as RecordId;

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

describe('useComments hooks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('useThread — fetches the interleaved thread for the record', async () => {
    mockedApi.fetchThread.mockResolvedValue([
      { kind: 'event', event: { eventType: 'request.created', eventAt: '2026-07-01T09:00:00Z', summary: 'Request created' } },
    ]);
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useThread(RECORD), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(mockedApi.fetchThread).toHaveBeenCalledWith(RECORD, expect.anything());
  });

  it('useThread — stays disabled with no record id', () => {
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useThread(undefined), { wrapper: Wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedApi.fetchThread).not.toHaveBeenCalled();
  });

  it('usePostComment — posts and invalidates the thread on success', async () => {
    mockedApi.postComment.mockResolvedValue({
      id: 'c1',
      recordId: RECORD,
      objectType: 'Request',
      authorUserId: 'u1',
      body: 'Ship it',
      mentionedUserIds: [],
      createdAt: '2026-07-01T12:00:00Z',
    } as never);
    const { client, Wrapper } = makeWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => usePostComment(RECORD), { wrapper: Wrapper });
    await result.current.mutateAsync({ body: 'Ship it', mentionedUserIds: [] });

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: threadKey(RECORD) }),
    );
  });
});

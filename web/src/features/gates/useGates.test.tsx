// Unit tests for the gate hooks. The API boundary is mocked; a local QueryClient wrapper hosts the
// hooks and its invalidation is spied on (web-testing.md — renderHook keeps a local wrapper).

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { RecordId, UserId } from '@shared/types';

import { buildApprovalRequest } from '@/test-utils';

import * as api from './api';
import { approvalRequestsKey, useApprovalRequests, useReRequest, useSubmitDecision } from './useGates';

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

describe('useGates hooks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('useApprovalRequests — fetches the record gates', async () => {
    mockedApi.fetchApprovalRequests.mockResolvedValue([buildApprovalRequest()]);
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useApprovalRequests(RECORD), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.fetchApprovalRequests).toHaveBeenCalledWith(RECORD, expect.anything());
  });

  it('useApprovalRequests — stays disabled with no record id', () => {
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useApprovalRequests(undefined), { wrapper: Wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedApi.fetchApprovalRequests).not.toHaveBeenCalled();
  });

  it('useSubmitDecision — submits then invalidates gates + record + list', async () => {
    mockedApi.submitDecision.mockResolvedValue(buildApprovalRequest({ state: 'Resolved' }));
    const { client, Wrapper } = makeWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useSubmitDecision(RECORD), { wrapper: Wrapper });
    result.current.mutate({ approvalRequestId: 'gate-1', request: { slotIndex: 0, decidedByUserId: 'user-casey' as UserId, decision: 'Approved' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.submitDecision).toHaveBeenCalledWith('gate-1', expect.objectContaining({ decision: 'Approved' }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: approvalRequestsKey(RECORD) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['request', RECORD] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['requests'] });
  });

  it('useReRequest — re-requests then invalidates the gates query', async () => {
    mockedApi.reRequestApproval.mockResolvedValue(buildApprovalRequest());
    const { client, Wrapper } = makeWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useReRequest(RECORD), { wrapper: Wrapper });
    result.current.mutate({ approvalRequestId: 'gate-1', slotIndex: 0 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.reRequestApproval).toHaveBeenCalledWith('gate-1', 0);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: approvalRequestsKey(RECORD) });
  });
});

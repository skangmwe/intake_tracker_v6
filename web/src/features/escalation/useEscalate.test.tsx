// Unit tests for the useEscalate hook. The API boundary is mocked; a local QueryClient wrapper hosts
// the hook (web-testing.md — renderHook keeps a local wrapper).

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { EscalateResult, RecordId, WorkspaceId } from '@shared/types';

import * as api from './api';
import { useEscalate } from './useEscalate';

jest.mock('./api');

const mockedApi = api as jest.Mocked<typeof api>;
const RECORD = 'LIT-00000001' as RecordId;

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

const RESULT: EscalateResult = { recordId: RECORD, aiWorkspaceId: 'ws-1' as WorkspaceId, aiRecord: null };

describe('useEscalate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('useEscalate — success — escalates and invalidates the record + lists', async () => {
    // Arrange
    mockedApi.escalateRequest.mockResolvedValue(RESULT);
    const { client, Wrapper } = makeWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    // Act
    const { result } = renderHook(() => useEscalate(RECORD), { wrapper: Wrapper });
    result.current.mutate({ confirmPendingEdits: true });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.escalateRequest).toHaveBeenCalledWith(RECORD, { confirmPendingEdits: true });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['request', RECORD] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['requests'] });
  });

  it('useEscalate — failure — surfaces the error without invalidating', async () => {
    // Arrange
    mockedApi.escalateRequest.mockRejectedValue(new Error('409'));
    const { client, Wrapper } = makeWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    // Act
    const { result } = renderHook(() => useEscalate(RECORD), { wrapper: Wrapper });
    result.current.mutate({ confirmPendingEdits: true });

    // Assert
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
  });
});

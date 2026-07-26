// Unit tests for the duplicate-check hooks. The api boundary is mocked; a local QueryClient wrapper hosts the
// hooks (web-testing.md — renderHook keeps a local wrapper). Covers the on-demand `active` gate and the
// confirm mutation's record invalidation.

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { RecordId, WorkspaceId } from '@shared/types';

import { requestKey } from '@/features/requests/useRequests';

import * as api from './api';
import { useConfirmDuplicate, useDuplicateCheck } from './useDuplicateCheck';

jest.mock('./api');

const mockedApi = api as jest.Mocked<typeof api>;
const WORKSPACE = 'ws-1' as WorkspaceId;
const RECORD = 'LIT-9004';

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

describe('useDuplicateCheck hooks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('useDuplicateCheck — inactive — does not run the check', () => {
    // Arrange
    mockedApi.checkDuplicates.mockResolvedValue([]);
    const { Wrapper } = makeWrapper();

    // Act
    const { result } = renderHook(() => useDuplicateCheck(WORKSPACE, RECORD, false), {
      wrapper: Wrapper,
    });

    // Assert - disabled until the panel is opened; no fetch fired.
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedApi.checkDuplicates).not.toHaveBeenCalled();
  });

  it('useDuplicateCheck — active — runs the check', async () => {
    // Arrange
    mockedApi.checkDuplicates.mockResolvedValue([
      { recordId: 'LIT-9010', title: 'Acme', score: 0.9, rationale: 'r' },
    ]);
    const { Wrapper } = makeWrapper();

    // Act
    const { result } = renderHook(() => useDuplicateCheck(WORKSPACE, RECORD, true), {
      wrapper: Wrapper,
    });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.checkDuplicates).toHaveBeenCalledWith(WORKSPACE, RECORD, expect.anything());
    expect(result.current.data).toHaveLength(1);
  });

  it('useConfirmDuplicate — success invalidates the record query', async () => {
    // Arrange
    mockedApi.confirmDuplicate.mockResolvedValue(undefined);
    const { client, Wrapper } = makeWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    // Act
    const { result } = renderHook(() => useConfirmDuplicate(WORKSPACE, RECORD), {
      wrapper: Wrapper,
    });
    result.current.mutate({ duplicateOfRecordId: 'LIT-9010', rationale: 'Same request.' });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.confirmDuplicate).toHaveBeenCalledWith(WORKSPACE, RECORD, {
      duplicateOfRecordId: 'LIT-9010',
      rationale: 'Same request.',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: requestKey(RECORD as RecordId) });
  });
});

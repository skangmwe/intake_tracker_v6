// Tests for the import-export hooks. The api module and the blob-save util are mocked at the boundary;
// the hooks' own behaviour (export → download, status query enable/disable) is what's under test.

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ImportStatusDto, SavedViewId } from '@shared/types';

import { saveBlob } from '@/shared/http/download';

import { exportView, fetchImportStatus } from './api';
import { useExportView, useImportStatus } from './useImportExport';

jest.mock('./api');
jest.mock('@/shared/http/download');

const mockedExport = exportView as jest.MockedFunction<typeof exportView>;
const mockedStatus = fetchImportStatus as jest.MockedFunction<typeof fetchImportStatus>;
const mockedSave = saveBlob as jest.MockedFunction<typeof saveBlob>;

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestQueryWrapper';
  return Wrapper;
}

beforeEach(() => jest.clearAllMocks());

describe('useExportView', () => {
  it('exports the view and saves the downloaded CSV', async () => {
    // Arrange
    const blob = new Blob(['csv']);
    mockedExport.mockResolvedValue(blob);
    const { result } = renderHook(() => useExportView(), { wrapper: wrapper() });

    // Act
    await result.current.mutateAsync('5a5e0000-0000-4000-8000-000000000001' as SavedViewId);

    // Assert
    expect(mockedExport).toHaveBeenCalledWith('5a5e0000-0000-4000-8000-000000000001');
    expect(mockedSave).toHaveBeenCalledWith(blob, 'requests-export.csv');
  });
});

describe('useImportStatus', () => {
  it('is disabled and never fetches when the importId is null', () => {
    // Act
    const { result } = renderHook(() => useImportStatus(null), { wrapper: wrapper() });

    // Assert — the query is disabled (idle), so the api is never called.
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedStatus).not.toHaveBeenCalled();
  });

  it('fetches the status for a real importId', async () => {
    // Arrange
    const job: ImportStatusDto = {
      id: 'imp-1' as ImportStatusDto['id'],
      workspaceId: 'ws-1' as ImportStatusDto['workspaceId'],
      startedBy: 'u-1' as ImportStatusDto['startedBy'],
      startedAt: '2026-07-06T10:00:00Z',
      status: 'Completed',
      totalRows: 3,
      landedRows: 3,
      flaggedRows: [],
    };
    mockedStatus.mockResolvedValue(job);

    // Act
    const { result } = renderHook(() => useImportStatus('imp-1'), { wrapper: wrapper() });

    // Assert
    await waitFor(() => expect(result.current.data).toEqual(job));
    expect(mockedStatus).toHaveBeenCalledWith('imp-1', expect.anything());
  });
});

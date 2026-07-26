// Tests for the import-export hooks. The api module and the blob-save util are mocked at the boundary;
// the hooks' own behaviour (export → download, status query enable/disable) is what's under test.

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ImportStatusDto, SavedViewId } from '@shared/types';

import { saveBlob } from '@/shared/http/download';

import type { WorkspaceId } from '@shared/types';

import { exportObject, exportView, fetchImportStatus, fetchIoObjects, startImport } from './api';
import {
  useExportObject,
  useExportView,
  useImportStatus,
  useIoObjects,
  useStartImport,
} from './useImportExport';

jest.mock('./api');
jest.mock('@/shared/http/download');

const mockedExport = exportView as jest.MockedFunction<typeof exportView>;
const mockedExportObject = exportObject as jest.MockedFunction<typeof exportObject>;
const mockedStatus = fetchImportStatus as jest.MockedFunction<typeof fetchImportStatus>;
const mockedIoObjects = fetchIoObjects as jest.MockedFunction<typeof fetchIoObjects>;
const mockedStart = startImport as jest.MockedFunction<typeof startImport>;
const mockedSave = saveBlob as jest.MockedFunction<typeof saveBlob>;

const WORKSPACE = '1a150000-0000-4000-8000-000000000001' as WorkspaceId;

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

describe('useIoObjects', () => {
  it('is disabled and never fetches when the workspace is undefined', () => {
    const { result } = renderHook(() => useIoObjects(undefined), { wrapper: wrapper() });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedIoObjects).not.toHaveBeenCalled();
  });

  it('fetches the io-object catalog for a real workspace', async () => {
    mockedIoObjects.mockResolvedValue([
      {
        objectType: 'Request',
        label: 'Requests',
        canImport: true,
        canExport: true,
        canUpsert: false,
        importFields: [],
        exportFields: [],
      },
    ]);
    const { result } = renderHook(() => useIoObjects(WORKSPACE), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(mockedIoObjects).toHaveBeenCalledWith(WORKSPACE, expect.anything());
  });
});

describe('useStartImport', () => {
  it('passes the file, object type, and mapping to startImport', async () => {
    // Arrange
    mockedStart.mockResolvedValue({ importId: 'imp-9' as never, status: 'Processing' });
    const file = new File(['Name\nA'], 'import.csv', { type: 'text/csv' });
    const { result } = renderHook(() => useStartImport(WORKSPACE), { wrapper: wrapper() });

    // Act
    await result.current.mutateAsync({
      file,
      objectType: 'Request',
      mapping: [{ columnIndex: 0, fieldKey: 'name' }],
      mode: 'create',
    });

    // Assert
    expect(mockedStart).toHaveBeenCalledWith(WORKSPACE, file, 'Request', [
      { columnIndex: 0, fieldKey: 'name' },
    ], 'create');
  });
});

describe('useExportObject', () => {
  it('exports the object and saves the CSV under an object-named file', async () => {
    // Arrange
    const blob = new Blob(['csv']);
    mockedExportObject.mockResolvedValue(blob);
    const { result } = renderHook(() => useExportObject(WORKSPACE), { wrapper: wrapper() });

    // Act
    await result.current.mutateAsync({ objectType: 'Request', fieldKeys: ['name'] });

    // Assert
    expect(mockedExportObject).toHaveBeenCalledWith(WORKSPACE, {
      objectType: 'Request',
      fieldKeys: ['name'],
    });
    expect(mockedSave).toHaveBeenCalledWith(blob, 'request-export.csv');
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
      createdRows: 3,
      updatedRows: 0,
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

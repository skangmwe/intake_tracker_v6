// Tests for the import-export api wrappers — verifies each builds the right path / method / body over
// the shared client. The client itself (apiFetch / apiFetchBlobPost) is mocked; its own behaviour is
// covered in shared/http/apiClient.test.ts.

import type { SavedViewId, WorkspaceId } from '@shared/types';

import { apiFetch, apiFetchBlobPost } from '@/shared/http/apiClient';

import { exportView, fetchImportStatus, startImport } from './api';

jest.mock('@/shared/http/apiClient');
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockedBlobPost = apiFetchBlobPost as jest.MockedFunction<typeof apiFetchBlobPost>;

const WORKSPACE = '1a150000-0000-4000-8000-000000000001' as WorkspaceId;
const VIEW = '5a5e0000-0000-4000-8000-000000000001' as SavedViewId;

beforeEach(() => jest.clearAllMocks());

describe('import-export api', () => {
  it('startImport — POSTs multipart form data with the file field', async () => {
    // Arrange
    mockedFetch.mockResolvedValue({ importId: 'x', status: 'Processing' } as never);
    const file = new File(['Name\nAlpha'], 'import.csv', { type: 'text/csv' });

    // Act
    await startImport(WORKSPACE, file);

    // Assert
    const [path, opts] = mockedFetch.mock.calls[0]!;
    expect(path).toBe(`/v1/workspaces/${WORKSPACE}/imports/csv`);
    expect(opts).toMatchObject({ method: 'POST' });
    expect((opts as { body: FormData }).body).toBeInstanceOf(FormData);
    expect((opts as { body: FormData }).body.get('file')).toBeInstanceOf(File);
  });

  it('fetchImportStatus — GETs the import status and passes the abort signal', async () => {
    // Arrange
    mockedFetch.mockResolvedValue({} as never);
    const controller = new AbortController();

    // Act
    await fetchImportStatus('imp-1', controller.signal);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith('/v1/imports/imp-1', { signal: controller.signal });
  });

  it('fetchImportStatus — omits the signal option when none is given', async () => {
    // Arrange
    mockedFetch.mockResolvedValue({} as never);

    // Act
    await fetchImportStatus('imp-1');

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith('/v1/imports/imp-1', {});
  });

  it('exportView — POSTs the saved-view id and reads back a Blob', async () => {
    // Arrange
    mockedBlobPost.mockResolvedValue(new Blob(['csv']));

    // Act
    await exportView(VIEW);

    // Assert
    expect(mockedBlobPost).toHaveBeenCalledWith('/v1/exports', { savedViewId: VIEW }, undefined);
  });
});

// Tests for the objects api wrappers — verifies each builds the right path / method / body over the
// shared client. The client itself (apiFetch) is mocked; its own behaviour is covered in
// shared/http/apiClient.test.ts.

import type { WorkspaceId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import { createObject, deleteObject, fetchObjects, updateObject } from './api';

jest.mock('@/shared/http/apiClient');
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const WORKSPACE = '1a150000-0000-4000-8000-000000000001' as WorkspaceId;
const OBJECT_ID = '00000000-0000-4000-8000-0000000000d1';

beforeEach(() => jest.clearAllMocks());

describe('objects api', () => {
  it('fetchObjects — GETs the workspace objects and passes the abort signal', async () => {
    // Arrange
    mockedFetch.mockResolvedValue([] as never);
    const controller = new AbortController();

    // Act
    await fetchObjects(WORKSPACE, controller.signal);

    // Assert
    const [path, opts] = mockedFetch.mock.calls[0]!;
    expect(path).toBe(`/v1/workspaces/${WORKSPACE}/objects`);
    expect((opts as { signal: AbortSignal }).signal).toBe(controller.signal);
  });

  it('createObject — POSTs the create body to the workspace collection', async () => {
    // Arrange
    mockedFetch.mockResolvedValue({} as never);
    const request = {
      name: 'Vendor',
      pluralLabel: 'Vendors',
      location: 'LocalWorkspace' as const,
      description: null,
      showInSidebar: true,
      sidebarCategory: 'Reference',
    };

    // Act
    await createObject(WORKSPACE, request);

    // Assert
    const [path, opts] = mockedFetch.mock.calls[0]!;
    expect(path).toBe(`/v1/workspaces/${WORKSPACE}/objects`);
    expect(opts).toMatchObject({ method: 'POST', body: request });
  });

  it('updateObject — PATCHes the object by id with the workspace query param', async () => {
    // Arrange
    mockedFetch.mockResolvedValue({} as never);

    // Act
    await updateObject(OBJECT_ID, WORKSPACE, { name: 'Supplier' });

    // Assert
    const [path, opts] = mockedFetch.mock.calls[0]!;
    expect(path).toBe(`/v1/objects/${OBJECT_ID}?workspaceId=${WORKSPACE}`);
    expect(opts).toMatchObject({ method: 'PATCH', body: { name: 'Supplier' } });
  });

  it('deleteObject — DELETEs the object by id with the workspace query param', async () => {
    // Arrange
    mockedFetch.mockResolvedValue(undefined as never);

    // Act
    await deleteObject(OBJECT_ID, WORKSPACE);

    // Assert
    const [path, opts] = mockedFetch.mock.calls[0]!;
    expect(path).toBe(`/v1/objects/${OBJECT_ID}?workspaceId=${WORKSPACE}`);
    expect(opts).toMatchObject({ method: 'DELETE' });
  });
});

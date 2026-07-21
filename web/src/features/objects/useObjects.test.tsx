// Tests for the objects hooks. The api module is mocked at the boundary; the hooks' own behaviour
// (list enable/disable, create vs patch routing, mutation → list invalidation) is what's under test.

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { WorkspaceId } from '@shared/types';

import { buildObjectDefinition } from '@/test-utils';

import { createObject, deleteObject, fetchObjects, updateObject } from './api';
import { objectsQueryKey, useDeleteObject, useSaveObject, useWorkspaceObjects } from './useObjects';

jest.mock('./api');
const mockedFetch = fetchObjects as jest.MockedFunction<typeof fetchObjects>;
const mockedCreate = createObject as jest.MockedFunction<typeof createObject>;
const mockedUpdate = updateObject as jest.MockedFunction<typeof updateObject>;
const mockedDelete = deleteObject as jest.MockedFunction<typeof deleteObject>;

const WORKSPACE = '1a150000-0000-4000-8000-000000000001' as WorkspaceId;
const OBJECT_ID = '00000000-0000-4000-8000-0000000000d1';

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}

beforeEach(() => jest.clearAllMocks());

describe('useWorkspaceObjects', () => {
  it('fetches the workspace objects when a workspace is set', async () => {
    // Arrange
    mockedFetch.mockResolvedValue([buildObjectDefinition()]);
    const { Wrapper } = makeWrapper();

    // Act
    const { result } = renderHook(() => useWorkspaceObjects(WORKSPACE), { wrapper: Wrapper });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedFetch).toHaveBeenCalledWith(WORKSPACE, expect.anything());
  });

  it('is disabled (never fetches) when no workspace is resolved', () => {
    // Arrange
    const { Wrapper } = makeWrapper();

    // Act
    const { result } = renderHook(() => useWorkspaceObjects(undefined), { wrapper: Wrapper });

    // Assert
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});

describe('useSaveObject', () => {
  it('routes a create input to createObject and invalidates the list', async () => {
    // Arrange
    mockedCreate.mockResolvedValue(buildObjectDefinition());
    const { client, Wrapper } = makeWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const request = {
      name: 'Vendor',
      pluralLabel: null,
      location: 'LocalWorkspace' as const,
      description: null,
      showInSidebar: true,
      sidebarCategory: null,
    };

    // Act
    const { result } = renderHook(() => useSaveObject(WORKSPACE), { wrapper: Wrapper });
    result.current.mutate({ isCreate: true, objectId: null, request });

    // Assert
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith(WORKSPACE, request));
    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: objectsQueryKey(WORKSPACE) });
  });

  it('routes an edit input to updateObject', async () => {
    // Arrange
    mockedUpdate.mockResolvedValue(buildObjectDefinition());
    const { Wrapper } = makeWrapper();

    // Act
    const { result } = renderHook(() => useSaveObject(WORKSPACE), { wrapper: Wrapper });
    result.current.mutate({ isCreate: false, objectId: OBJECT_ID, request: { name: 'Supplier' } });

    // Assert
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(OBJECT_ID, WORKSPACE, { name: 'Supplier' }),
    );
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});

describe('useDeleteObject', () => {
  it('deletes an object by id and invalidates the list', async () => {
    // Arrange
    mockedDelete.mockResolvedValue(undefined);
    const { client, Wrapper } = makeWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    // Act
    const { result } = renderHook(() => useDeleteObject(WORKSPACE), { wrapper: Wrapper });
    result.current.mutate(OBJECT_ID);

    // Assert
    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith(OBJECT_ID, WORKSPACE));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: objectsQueryKey(WORKSPACE) });
  });
});

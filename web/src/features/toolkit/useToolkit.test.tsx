// Unit tests for the Toolkit query hooks — verifies the list query is disabled without a workspace,
// and that the create/update mutations call the API and invalidate the list. The API module is mocked
// at the boundary (web-testing.md). renderHook keeps a local QueryClient wrapper (web-testing.md — the
// TanStack wrapper option does not compose with a JSX render helper).

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type {
  ToolkitItemDto,
  ToolkitItemId,
  ToolkitListResponse,
  WorkspaceId,
} from '@shared/types';

import { createToolkitItem, patchToolkitItem, queryToolkit } from './api';
import { useCreateToolkitItem, useToolkitList, useUpdateToolkitItem } from './useToolkit';

jest.mock('./api');

const mockedQuery = queryToolkit as jest.MockedFunction<typeof queryToolkit>;
const mockedCreate = createToolkitItem as jest.MockedFunction<typeof createToolkitItem>;
const mockedPatch = patchToolkitItem as jest.MockedFunction<typeof patchToolkitItem>;

const WS = 'ws-1' as WorkspaceId;
const ITEM = 'AIS-00000073' as ToolkitItemId;

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    Wrap: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

const emptyPage: ToolkitListResponse = { items: [], totalCount: 0, page: 1, pageSize: 20 };
const sampleDto = { id: ITEM } as ToolkitItemDto;

beforeEach(() => jest.clearAllMocks());

describe('useToolkit', () => {
  it('useToolkitList — disabled when no workspace is resolved', () => {
    // Arrange
    const { Wrap } = wrapper();

    // Act
    const { result } = renderHook(() => useToolkitList(null, { page: 1, pageSize: 20 }), { wrapper: Wrap });

    // Assert — the query never fires without a workspace.
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('useToolkitList — fetches when a workspace is present', async () => {
    // Arrange
    mockedQuery.mockResolvedValue(emptyPage);
    const { Wrap } = wrapper();

    // Act
    const { result } = renderHook(() => useToolkitList(WS, { page: 1, pageSize: 20 }), { wrapper: Wrap });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedQuery).toHaveBeenCalled();
  });

  it('useCreateToolkitItem — calls the API and invalidates the list', async () => {
    // Arrange
    mockedCreate.mockResolvedValue(sampleDto);
    const { client, Wrap } = wrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCreateToolkitItem(WS), { wrapper: Wrap });

    // Act
    result.current.mutate({ request: { kind: 'Prompt', name: 'X' }, file: null });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedCreate).toHaveBeenCalledWith(WS, { kind: 'Prompt', name: 'X' }, null);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['toolkit'] });
  });

  it('useUpdateToolkitItem — calls the API and adopts the fresh record', async () => {
    // Arrange
    mockedPatch.mockResolvedValue(sampleDto);
    const { client, Wrap } = wrapper();
    const setData = jest.spyOn(client, 'setQueryData');
    const { result } = renderHook(() => useUpdateToolkitItem(ITEM), { wrapper: Wrap });

    // Act
    result.current.mutate({ request: { name: 'Y' }, file: null });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedPatch).toHaveBeenCalledWith(ITEM, { name: 'Y' }, null);
    expect(setData).toHaveBeenCalled();
  });
});

// Tests for the custom-records hooks. The api module is mocked at the boundary; the hooks' own
// behaviour (query-key shape, enable/disable guards, calling the api with the right args) is under
// test — not the network.

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderHook, waitFor } from '@testing-library/react';

import type {
  CustomRecordDto,
  CustomRecordListRow,
  PaginatedQuery,
  PaginatedResponse,
  WorkspaceId,
} from '@shared/types';

import { createRecord, deleteRecord, getRecord, patchRecord, queryRecords } from './api';
import {
  customRecordKey,
  customRecordsListKey,
  useCreateCustomRecord,
  useCustomRecord,
  useCustomRecordsList,
  useDeleteCustomRecord,
  usePatchCustomRecord,
} from './useCustomRecords';

jest.mock('./api');
const mockedQuery = queryRecords as jest.MockedFunction<typeof queryRecords>;
const mockedGet = getRecord as jest.MockedFunction<typeof getRecord>;
const mockedCreate = createRecord as jest.MockedFunction<typeof createRecord>;
const mockedPatch = patchRecord as jest.MockedFunction<typeof patchRecord>;
const mockedDelete = deleteRecord as jest.MockedFunction<typeof deleteRecord>;

const WORKSPACE = '1a150000-0000-4000-8000-000000000001' as WorkspaceId;
const OBJECT_ID = '00000000-0000-4000-8000-0000000000d1';
const RECORD_ID = '00000000-0000-4000-8000-0000000000e1';
const QUERY: PaginatedQuery = { page: 1, pageSize: 25 };

function page(items: CustomRecordListRow[]): PaginatedResponse<CustomRecordListRow> {
  return { items, totalCount: items.length, page: 1, pageSize: 25 };
}

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, Wrapper };
}

beforeEach(() => jest.clearAllMocks());

describe('customRecordsListKey', () => {
  it('customRecordsListKey — with ids and query — includes them all', () => {
    // Arrange / Act
    const key = customRecordsListKey(WORKSPACE, OBJECT_ID, QUERY);

    // Assert
    expect(key).toEqual(['custom-records', WORKSPACE, OBJECT_ID, QUERY]);
  });

  it('customRecordKey — by id — namespaces the detail entry', () => {
    // Arrange / Act / Assert
    expect(customRecordKey(RECORD_ID)).toEqual(['custom-records', 'detail', RECORD_ID]);
  });
});

describe('useCustomRecordsList', () => {
  it('useCustomRecordsList — object resolved — queries with the right args and returns items', async () => {
    // Arrange
    const row: CustomRecordListRow = { id: RECORD_ID, name: 'Acme', fields: {}, eTag: 'v1' };
    mockedQuery.mockResolvedValue(page([row]));
    const { Wrapper } = makeWrapper();

    // Act
    const { result } = renderHook(() => useCustomRecordsList(WORKSPACE, OBJECT_ID, QUERY), {
      wrapper: Wrapper,
    });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedQuery).toHaveBeenCalledWith(WORKSPACE, OBJECT_ID, QUERY, expect.anything());
    expect(result.current.data?.items).toEqual([row]);
  });

  it('useCustomRecordsList — no object id — is disabled and never queries', () => {
    // Arrange
    const { Wrapper } = makeWrapper();

    // Act
    const { result } = renderHook(() => useCustomRecordsList(WORKSPACE, undefined, QUERY), {
      wrapper: Wrapper,
    });

    // Assert
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedQuery).not.toHaveBeenCalled();
  });
});

describe('useCustomRecord', () => {
  it('useCustomRecord — all ids present — reads the record', async () => {
    // Arrange
    mockedGet.mockResolvedValue({ id: RECORD_ID, name: 'Acme' } as unknown as CustomRecordDto);
    const { Wrapper } = makeWrapper();

    // Act
    const { result } = renderHook(() => useCustomRecord(WORKSPACE, OBJECT_ID, RECORD_ID), {
      wrapper: Wrapper,
    });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedGet).toHaveBeenCalledWith(WORKSPACE, OBJECT_ID, RECORD_ID, expect.anything());
  });

  it('useCustomRecord — no record id — is disabled', () => {
    // Arrange
    const { Wrapper } = makeWrapper();

    // Act
    const { result } = renderHook(() => useCustomRecord(WORKSPACE, OBJECT_ID, undefined), {
      wrapper: Wrapper,
    });

    // Assert
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedGet).not.toHaveBeenCalled();
  });
});

describe('useCreateCustomRecord', () => {
  it('useCreateCustomRecord — on success — creates and invalidates the object lists', async () => {
    // Arrange
    mockedCreate.mockResolvedValue({ id: RECORD_ID, name: 'Acme' } as unknown as CustomRecordDto);
    const { client, Wrapper } = makeWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const body = { name: 'Acme', fields: { spend: 100 } };

    // Act
    const { result } = renderHook(() => useCreateCustomRecord(WORKSPACE, OBJECT_ID), { wrapper: Wrapper });
    result.current.mutate(body);

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedCreate).toHaveBeenCalledWith(WORKSPACE, OBJECT_ID, body);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['custom-records', WORKSPACE, OBJECT_ID] });
  });
});

describe('usePatchCustomRecord', () => {
  it('usePatchCustomRecord — on success — sends the full field map and adopts the fresh record', async () => {
    // Arrange
    const fresh = { id: RECORD_ID, name: 'Acme', fields: { spend: 200 } } as unknown as CustomRecordDto;
    mockedPatch.mockResolvedValue(fresh);
    const { client, Wrapper } = makeWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const body = { name: 'Acme', fields: { spend: 200 } };

    // Act
    const { result } = renderHook(() => usePatchCustomRecord(WORKSPACE, OBJECT_ID, RECORD_ID), {
      wrapper: Wrapper,
    });
    result.current.mutate(body);

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedPatch).toHaveBeenCalledWith(WORKSPACE, OBJECT_ID, RECORD_ID, body);
    expect(client.getQueryData(customRecordKey(RECORD_ID))).toBe(fresh);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['custom-records', WORKSPACE, OBJECT_ID] });
  });
});

describe('useDeleteCustomRecord', () => {
  it('useDeleteCustomRecord — on success — deletes and invalidates the lists and detail', async () => {
    // Arrange
    mockedDelete.mockResolvedValue(undefined);
    const { client, Wrapper } = makeWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    // Act
    const { result } = renderHook(() => useDeleteCustomRecord(WORKSPACE, OBJECT_ID), { wrapper: Wrapper });
    result.current.mutate(RECORD_ID);

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedDelete).toHaveBeenCalledWith(WORKSPACE, OBJECT_ID, RECORD_ID);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['custom-records', WORKSPACE, OBJECT_ID] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: customRecordKey(RECORD_ID) });
  });
});

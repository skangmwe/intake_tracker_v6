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

import { getRecord, queryRecords } from './api';
import {
  customRecordKey,
  customRecordsListKey,
  useCustomRecord,
  useCustomRecordsList,
} from './useCustomRecords';

jest.mock('./api');
const mockedQuery = queryRecords as jest.MockedFunction<typeof queryRecords>;
const mockedGet = getRecord as jest.MockedFunction<typeof getRecord>;

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

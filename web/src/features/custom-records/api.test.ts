// custom-records/api — asserts each wrapper hits the right path with the right method/body. apiFetch
// is mocked at the boundary (it owns the `/api` prefix + auth), so these tests pin the contract only.

import type {
  CustomRecordDto,
  CustomRecordListRow,
  PaginatedQuery,
  PaginatedResponse,
  WorkspaceId,
} from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import { getRecord, queryRecords } from './api';

jest.mock('@/shared/http/apiClient');
const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const WORKSPACE = '1a150000-0000-4000-8000-000000000001' as WorkspaceId;
const OBJECT_ID = '00000000-0000-4000-8000-0000000000d1';
const RECORD_ID = '00000000-0000-4000-8000-0000000000e1';

beforeEach(() => jest.clearAllMocks());

describe('queryRecords', () => {
  it('queryRecords — with a query — POSTs the query body to the records query path', async () => {
    // Arrange
    const emptyPage: PaginatedResponse<CustomRecordListRow> = {
      items: [],
      totalCount: 0,
      page: 1,
      pageSize: 25,
    };
    mockedApiFetch.mockResolvedValue(emptyPage);
    const query: PaginatedQuery = { page: 1, pageSize: 25, filters: { name: { kind: 'text', contains: 'x' } } };

    // Act
    const result = await queryRecords(WORKSPACE, OBJECT_ID, query);

    // Assert
    expect(mockedApiFetch).toHaveBeenCalledWith(
      `/v1/workspaces/${WORKSPACE}/objects/${OBJECT_ID}/records/query`,
      expect.objectContaining({ method: 'POST', body: query }),
    );
    expect(result).toBe(emptyPage);
  });

  it('queryRecords — with a signal — forwards the abort signal', async () => {
    // Arrange
    mockedApiFetch.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 25 });
    const controller = new AbortController();
    const query: PaginatedQuery = { page: 1, pageSize: 25 };

    // Act
    await queryRecords(WORKSPACE, OBJECT_ID, query, controller.signal);

    // Assert
    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});

describe('getRecord', () => {
  it('getRecord — by id — GETs the record path', async () => {
    // Arrange
    const dto = { id: RECORD_ID, name: 'Acme' } as unknown as CustomRecordDto;
    mockedApiFetch.mockResolvedValue(dto);

    // Act
    const result = await getRecord(WORKSPACE, OBJECT_ID, RECORD_ID);

    // Assert
    expect(mockedApiFetch).toHaveBeenCalledWith(
      `/v1/workspaces/${WORKSPACE}/objects/${OBJECT_ID}/records/${RECORD_ID}`,
      {},
    );
    expect(result).toBe(dto);
  });
});

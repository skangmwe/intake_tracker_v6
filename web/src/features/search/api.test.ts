// Tests for the search api wrappers — verifies each builds the right path / method / body over the
// shared client. The client itself (apiFetch) is mocked; its own behaviour is covered in
// shared/http/apiClient.test.ts.

import type { WorkspaceId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import { searchFull, searchRecords } from './api';

jest.mock('@/shared/http/apiClient');
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const WORKSPACE_ID = 'ws-1' as WorkspaceId;

beforeEach(() => jest.clearAllMocks());

it('searchRecords — GETs the encoded quick-search path and passes the signal', async () => {
  // Arrange
  mockedFetch.mockResolvedValue([]);
  const controller = new AbortController();

  // Act
  await searchRecords(WORKSPACE_ID, 'contract clause', controller.signal);

  // Assert — query + workspaceId are URL-encoded by the shared withQuery helper.
  expect(mockedFetch).toHaveBeenCalledWith('/v1/search?q=contract+clause&workspaceId=ws-1', {
    signal: controller.signal,
  });
});

it('searchRecords — without a signal — omits it from the options', async () => {
  // Arrange
  mockedFetch.mockResolvedValue([]);

  // Act
  await searchRecords(WORKSPACE_ID, 'contract');

  // Assert
  expect(mockedFetch).toHaveBeenCalledWith('/v1/search?q=contract&workspaceId=ws-1', {});
});

it('searchFull — POSTs the query body and passes the signal', async () => {
  // Arrange
  mockedFetch.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 20 });
  const controller = new AbortController();

  // Act
  await searchFull(WORKSPACE_ID, 'omega', 2, 20, controller.signal);

  // Assert
  expect(mockedFetch).toHaveBeenCalledWith('/v1/search/full', {
    method: 'POST',
    body: { query: 'omega', workspaceId: WORKSPACE_ID, page: 2, pageSize: 20 },
    signal: controller.signal,
  });
});

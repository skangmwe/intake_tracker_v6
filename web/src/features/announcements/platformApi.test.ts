// Tests for the platform broadcast api wrappers — verifies each builds the right path / method / body over
// the shared client. The client itself (apiFetch) is mocked; its own behaviour is covered in
// shared/http/apiClient.test.ts.

import { apiFetch } from '@/shared/http/apiClient';

import {
  createPlatformBroadcast,
  fetchPlatformWorkspaces,
  queryPlatformAnnouncements,
  retirePlatformBroadcast,
  updatePlatformBroadcast,
} from './platformApi';

jest.mock('@/shared/http/apiClient');
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => jest.clearAllMocks());

it('fetchPlatformWorkspaces — GETs the workspaces path and passes the signal', async () => {
  // Arrange
  mockedFetch.mockResolvedValue([]);
  const controller = new AbortController();

  // Act
  await fetchPlatformWorkspaces(controller.signal);

  // Assert
  expect(mockedFetch).toHaveBeenCalledWith('/v1/platform/workspaces', { signal: controller.signal });
});

it('createPlatformBroadcast — POSTs the request body', async () => {
  // Arrange
  mockedFetch.mockResolvedValue({ broadcastId: 'b1', workspaceCount: 3 });
  const request = {
    title: 'Notice',
    body: 'Body',
    status: 'Active' as const,
    target: { kind: 'all' as const },
  };

  // Act
  await createPlatformBroadcast(request);

  // Assert
  expect(mockedFetch).toHaveBeenCalledWith('/v1/platform/announcements', { method: 'POST', body: request });
});

it('queryPlatformAnnouncements — POSTs the page body', async () => {
  // Arrange
  mockedFetch.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 100 });

  // Act
  await queryPlatformAnnouncements({ page: 1, pageSize: 100 });

  // Assert
  expect(mockedFetch).toHaveBeenCalledWith('/v1/platform/announcements/query', {
    method: 'POST',
    body: { page: 1, pageSize: 100 },
  });
});

it('updatePlatformBroadcast — PATCHes the broadcast path', async () => {
  // Arrange
  mockedFetch.mockResolvedValue(undefined);
  const request = { title: 'New', body: 'B', pinned: false, status: 'Active' as const };

  // Act
  await updatePlatformBroadcast('b1', request);

  // Assert
  expect(mockedFetch).toHaveBeenCalledWith('/v1/platform/announcements/b1', {
    method: 'PATCH',
    body: request,
  });
});

it('retirePlatformBroadcast — POSTs to the retire path', async () => {
  // Arrange
  mockedFetch.mockResolvedValue(undefined);

  // Act
  await retirePlatformBroadcast('b1');

  // Assert
  expect(mockedFetch).toHaveBeenCalledWith('/v1/platform/announcements/b1/retire', {
    method: 'POST',
    body: {},
  });
});

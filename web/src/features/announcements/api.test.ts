// Tests for the announcements api wrappers — verifies each builds the right path / method / body over
// the shared client. The client itself (apiFetch) is mocked; its own behaviour is covered in
// shared/http/apiClient.test.ts.

import type { WorkspaceId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import {
  createAnnouncement,
  fetchAnnouncement,
  publishAnnouncement,
  queryAnnouncements,
  queryManagedAnnouncements,
  retireAnnouncement,
  updateAnnouncement,
} from './api';

jest.mock('@/shared/http/apiClient');
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const WORKSPACE_ID = 'ws-1' as WorkspaceId;

beforeEach(() => jest.clearAllMocks());

it('queryAnnouncements — POSTs the page body and passes the signal', async () => {
  // Arrange
  mockedFetch.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 20 });
  const controller = new AbortController();

  // Act
  await queryAnnouncements({ page: 1, pageSize: 20 }, controller.signal);

  // Assert
  expect(mockedFetch).toHaveBeenCalledWith('/v1/announcements/query', {
    method: 'POST',
    body: { page: 1, pageSize: 20 },
    signal: controller.signal,
  });
});

it('fetchAnnouncement — GETs the detail path', async () => {
  // Arrange
  mockedFetch.mockResolvedValue({});

  // Act
  await fetchAnnouncement('a1');

  // Assert
  expect(mockedFetch).toHaveBeenCalledWith('/v1/announcements/a1', {});
});

it('queryManagedAnnouncements — POSTs to the workspace-scoped manage path', async () => {
  // Arrange
  mockedFetch.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 20 });

  // Act
  await queryManagedAnnouncements(WORKSPACE_ID, { page: 2, pageSize: 20 });

  // Assert
  expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/announcements/query', {
    method: 'POST',
    body: { page: 2, pageSize: 20 },
  });
});

it('createAnnouncement — POSTs to the workspace-scoped create path', async () => {
  // Arrange
  mockedFetch.mockResolvedValue({});
  const request = { title: 'T', body: 'B', audience: { kind: 'everyone' as const } };

  // Act
  await createAnnouncement(WORKSPACE_ID, request);

  // Assert
  expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/announcements', { method: 'POST', body: request });
});

it('updateAnnouncement — PATCHes the detail path', async () => {
  // Arrange
  mockedFetch.mockResolvedValue({});
  const request = { title: 'T', body: 'B', audience: { kind: 'everyone' as const }, pinned: true };

  // Act
  await updateAnnouncement('a1', request);

  // Assert
  expect(mockedFetch).toHaveBeenCalledWith('/v1/announcements/a1', { method: 'PATCH', body: request });
});

it('publishAnnouncement — POSTs to the publish path', async () => {
  // Arrange
  mockedFetch.mockResolvedValue({});

  // Act
  await publishAnnouncement('a1');

  // Assert
  expect(mockedFetch).toHaveBeenCalledWith('/v1/announcements/a1/publish', { method: 'POST', body: {} });
});

it('retireAnnouncement — POSTs to the retire path', async () => {
  // Arrange
  mockedFetch.mockResolvedValue({});

  // Act
  await retireAnnouncement('a1');

  // Assert
  expect(mockedFetch).toHaveBeenCalledWith('/v1/announcements/a1/retire', { method: 'POST', body: {} });
});

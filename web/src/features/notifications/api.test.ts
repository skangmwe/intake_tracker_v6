// Tests for the notifications api wrappers — verifies each builds the right path / method / body over
// the shared client. The client itself (apiFetch) is mocked; its own behaviour is covered in
// shared/http/apiClient.test.ts.

import { apiFetch } from '@/shared/http/apiClient';

import {
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  queryNotifications,
} from './api';

jest.mock('@/shared/http/apiClient');
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => jest.clearAllMocks());

describe('notifications api', () => {
  it('queryNotifications — POSTs the query body and passes the abort signal', async () => {
    // Arrange
    mockedFetch.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 20 });
    const controller = new AbortController();

    // Act
    await queryNotifications({ page: 1, pageSize: 20, unreadOnly: false }, controller.signal);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith('/v1/notifications/query', {
      method: 'POST',
      body: { page: 1, pageSize: 20, unreadOnly: false },
      signal: controller.signal,
    });
  });

  it('queryNotifications — omits the signal option when none is given', async () => {
    // Arrange
    mockedFetch.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 20 });

    // Act
    await queryNotifications({ page: 1, pageSize: 20, unreadOnly: true });

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith('/v1/notifications/query', {
      method: 'POST',
      body: { page: 1, pageSize: 20, unreadOnly: true },
    });
  });

  it('fetchUnreadCount — GETs the unread count', async () => {
    // Arrange
    mockedFetch.mockResolvedValue({ count: 0 });

    // Act
    await fetchUnreadCount();

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith('/v1/notifications/unread-count', {});
  });

  it('markAllNotificationsRead — POSTs to mark-all-read', async () => {
    // Arrange
    mockedFetch.mockResolvedValue(undefined);

    // Act
    await markAllNotificationsRead();

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith('/v1/notifications/mark-all-read', { method: 'POST', body: {} });
  });

  it('markNotificationRead — POSTs to the per-id mark-read path', async () => {
    // Arrange
    mockedFetch.mockResolvedValue(undefined);

    // Act
    await markNotificationRead('abc-123');

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith('/v1/notifications/abc-123/mark-read', { method: 'POST', body: {} });
  });
});

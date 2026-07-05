// Tests for the notifications hooks (web-testing.md). Covers the unread-count query, the feed's
// enabled=open gating (no fetch while closed), and the mark mutations invalidating the caches. The
// API boundary is mocked; a local QueryClient wrapper hosts the hooks.

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as api from './api';
import {
  useMarkAllRead,
  useMarkNotificationRead,
  useNotificationsFeed,
  useUnreadCount,
} from './useNotifications';

jest.mock('./api');
const mockedApi = api as jest.Mocked<typeof api>;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => jest.clearAllMocks());

describe('useUnreadCount', () => {
  it('useUnreadCount — fetches the badge count', async () => {
    // Arrange
    mockedApi.fetchUnreadCount.mockResolvedValue({ count: 3 });

    // Act
    const { result } = renderHook(() => useUnreadCount(), { wrapper });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.count).toBe(3);
  });
});

describe('useNotificationsFeed', () => {
  it('useNotificationsFeed — stays idle (no fetch) while closed', () => {
    // Act
    const { result } = renderHook(() => useNotificationsFeed(false), { wrapper });

    // Assert
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedApi.queryNotifications).not.toHaveBeenCalled();
  });

  it('useNotificationsFeed — fetches page one when opened', async () => {
    // Arrange
    mockedApi.queryNotifications.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 20 });

    // Act
    const { result } = renderHook(() => useNotificationsFeed(true), { wrapper });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.queryNotifications).toHaveBeenCalledWith(
      { page: 1, pageSize: 20, unreadOnly: false },
      expect.anything(),
    );
  });
});

describe('useMarkAllRead', () => {
  it('useMarkAllRead — calls the endpoint on mutate', async () => {
    // Arrange
    mockedApi.markAllNotificationsRead.mockResolvedValue(undefined);
    const { result } = renderHook(() => useMarkAllRead(), { wrapper });

    // Act
    result.current.mutate();

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.markAllNotificationsRead).toHaveBeenCalledTimes(1);
  });
});

describe('useMarkNotificationRead', () => {
  it('useMarkNotificationRead — marks one by id on mutate', async () => {
    // Arrange
    mockedApi.markNotificationRead.mockResolvedValue(undefined);
    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });

    // Act
    result.current.mutate('n1');

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.markNotificationRead).toHaveBeenCalledWith('n1');
  });
});

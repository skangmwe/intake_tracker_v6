// TanStack Query hooks for the bell centre (S20 — web-state-management.md). The unread-count query
// drives the badge (always live); the feed query loads when the popover opens (enabled flag). Mark
// actions invalidate both so the badge and list refresh. Query keys are exported for tests.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { NotificationDto, PaginatedResponse, UnreadCountDto } from '@shared/types';

import {
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  queryNotifications,
} from './api';

/** Bell feed page size — one page covers the popover; a full history surface is out of R1 scope. */
export const NOTIFICATIONS_PAGE_SIZE = 20;

export const unreadCountKey = ['notifications', 'unread-count'] as const;
export const notificationsFeedKey = ['notifications', 'feed'] as const;

/** The caller's unread count (bell badge). */
export function useUnreadCount() {
  return useQuery<UnreadCountDto>({
    queryKey: unreadCountKey,
    queryFn: ({ signal }) => fetchUnreadCount(signal),
  });
}

/** The caller's bell feed. Only fetched while `enabled` (the popover is open). */
export function useNotificationsFeed(enabled: boolean) {
  return useQuery<PaginatedResponse<NotificationDto>>({
    queryKey: notificationsFeedKey,
    queryFn: ({ signal }) =>
      queryNotifications({ page: 1, pageSize: NOTIFICATIONS_PAGE_SIZE, unreadOnly: false }, signal),
    enabled,
  });
}

/** Mark all read. Invalidates the badge + feed. */
export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation<void, unknown, void>({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: unreadCountKey });
      void queryClient.invalidateQueries({ queryKey: notificationsFeedKey });
    },
  });
}

/** Mark one read. Invalidates the badge + feed. */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (id) => markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: unreadCountKey });
      void queryClient.invalidateQueries({ queryKey: notificationsFeedKey });
    },
  });
}

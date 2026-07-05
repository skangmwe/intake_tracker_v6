// Notifications API calls (S20 bell centre — api-contracts.md §13). One thin apiFetch wrapper per
// endpoint; the /api prefix is added inside apiFetch. The feed is a POST body query (matches the
// established POST …/query convention); the badge count is a small GET.

import type {
  NotificationDto,
  NotificationQuery,
  PaginatedResponse,
  UnreadCountDto,
} from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

/** The caller's paginated bell feed (newest first). */
export function queryNotifications(
  query: NotificationQuery,
  signal?: AbortSignal,
): Promise<PaginatedResponse<NotificationDto>> {
  return apiFetch<PaginatedResponse<NotificationDto>>('/v1/notifications/query', {
    method: 'POST',
    body: query,
    ...(signal ? { signal } : {}),
  });
}

/** The caller's unread count — drives the bell badge. */
export function fetchUnreadCount(signal?: AbortSignal): Promise<UnreadCountDto> {
  return apiFetch<UnreadCountDto>('/v1/notifications/unread-count', signal ? { signal } : {});
}

/** Mark all the caller's notifications read. */
export function markAllNotificationsRead(): Promise<void> {
  return apiFetch<void>('/v1/notifications/mark-all-read', { method: 'POST', body: {} });
}

/** Mark one notification read. */
export function markNotificationRead(id: string): Promise<void> {
  return apiFetch<void>(`/v1/notifications/${id}/mark-read`, { method: 'POST', body: {} });
}

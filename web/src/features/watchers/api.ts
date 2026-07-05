// Watchers API calls (S4/S5 Watchers & alerts tab — api-contracts.md §10). One thin apiFetch wrapper
// per endpoint; the /api prefix is added inside apiFetch. The roster read carries DisplayName +
// isWatching so the card renders and sets the toggle without a second directory fetch.

import type { RecordId, UserId, WatcherListDto } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

/** A record's live watchers + the caller's own subscription state (access-respecting). */
export function fetchWatchers(recordId: RecordId, signal?: AbortSignal): Promise<WatcherListDto> {
  return apiFetch<WatcherListDto>(`/v1/records/${recordId}/watchers`, signal ? { signal } : {});
}

/** Subscribe the caller to the record. Idempotent. 204 → void. */
export function watchRecord(recordId: RecordId): Promise<void> {
  return apiFetch<void>(`/v1/records/${recordId}/watchers`, { method: 'POST', body: {} });
}

/** Unsubscribe a user (the caller, or another when WorkspaceAdmin). Idempotent. 204 → void. */
export function unwatchRecord(recordId: RecordId, userId: UserId): Promise<void> {
  return apiFetch<void>(`/v1/records/${recordId}/watchers/${userId}`, { method: 'DELETE' });
}

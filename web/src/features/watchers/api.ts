// Watchers API calls (S4/S5 Watchers & alerts tab — api-contracts.md §10). One thin apiFetch wrapper
// per endpoint; the /api prefix is added inside apiFetch. The roster read carries DisplayName +
// isWatching so the card renders and sets the toggle without a second directory fetch.

import type {
  RecordId,
  UserId,
  WatcherListDto,
  WatcherPreferencesPatchRequest,
} from '@shared/types';

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

/**
 * Slice 26 — sparse update of the caller's own record-scoped state: subscribe toggle plus the five
 * per-record notification preferences. Returns the refreshed WatcherListDto so the card re-renders
 * without a second round-trip. Missing fields on the request leave the corresponding server state
 * unchanged (see api-contracts.md §10, `PATCH /records/{recordId}/watchers/me`).
 */
export function patchMyWatch(
  recordId: RecordId,
  request: WatcherPreferencesPatchRequest,
): Promise<WatcherListDto> {
  return apiFetch<WatcherListDto>(`/v1/records/${recordId}/watchers/me`, {
    method: 'PATCH',
    body: request,
  });
}

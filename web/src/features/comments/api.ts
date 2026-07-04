// Comments & activity-thread API calls (S4/S5 Activity tab) — api-contracts.md §7.
// The thread endpoint returns items with both `comment` and `event` keys (one null); we narrow
// them into the ActivityThreadItem discriminated union at the boundary so consumers stay type-safe.

import type {
  ActivityThreadItem,
  AuditEventItem,
  CommentCreateRequest,
  CommentDto,
  RecordId,
} from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

/** The wire shape from GET /records/{id}/thread before narrowing to the union. */
interface RawThreadItem {
  kind: 'comment' | 'event';
  comment?: CommentDto | null;
  event?: AuditEventItem | null;
}

function narrow(raw: RawThreadItem): ActivityThreadItem | null {
  if (raw.kind === 'comment' && raw.comment) {
    return { kind: 'comment', comment: raw.comment };
  }
  if (raw.kind === 'event' && raw.event) {
    return { kind: 'event', event: raw.event };
  }
  return null;
}

export async function fetchThread(recordId: RecordId, signal?: AbortSignal): Promise<ActivityThreadItem[]> {
  const raw = await apiFetch<RawThreadItem[]>(`/v1/records/${recordId}/thread`, signal ? { signal } : {});
  return raw.map(narrow).filter((item): item is ActivityThreadItem => item !== null);
}

export function postComment(recordId: RecordId, request: CommentCreateRequest): Promise<CommentDto> {
  return apiFetch<CommentDto>(`/v1/records/${recordId}/comments`, { method: 'POST', body: request });
}

// Search API calls (S27 + top-bar quick search) — api-contracts.md §14. One thin apiFetch wrapper
// per endpoint; the /api prefix is added inside apiFetch.

import type {
  PaginatedResponse,
  SearchHitDto,
  SearchResultDto,
  WorkspaceId,
} from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';
import { withQuery } from '@/shared/http/url';

/** Top-bar records-only quick search — up to 6 access-respecting hits (BS §9.5). */
export function searchRecords(
  workspaceId: WorkspaceId,
  query: string,
  signal?: AbortSignal,
): Promise<SearchHitDto[]> {
  const path = withQuery('/v1/search', { q: query, workspaceId });
  return apiFetch<SearchHitDto[]>(path, signal ? { signal } : {});
}

/** Full search (S27) across fields, comments, and attachment filenames — paginated. */
export function searchFull(
  workspaceId: WorkspaceId,
  query: string,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<PaginatedResponse<SearchResultDto>> {
  return apiFetch<PaginatedResponse<SearchResultDto>>('/v1/search/full', {
    method: 'POST',
    body: { query, workspaceId, page, pageSize },
    ...(signal ? { signal } : {}),
  });
}

// TanStack Query hooks for Search (top-bar quick search + S27 results) — web-state-management.md.
// Query-key factories are exported so pages and tests can target/invalidate precisely. Both hooks
// only fire once the (caller-debounced) query clears the minimum length; `placeholderData` avoids a
// flash to empty between keystrokes / page changes. Access is enforced server-side.

import { useQuery } from '@tanstack/react-query';

import type {
  PaginatedResponse,
  SearchHitDto,
  SearchResultDto,
  WorkspaceId,
} from '@shared/types';

import { SEARCH_MIN_QUERY_LENGTH, SEARCH_RESULTS_PAGE_SIZE } from '@/shared/constants';

import { searchFull, searchRecords } from './api';

export const quickSearchKey = (workspaceId: WorkspaceId, query: string) =>
  ['search', workspaceId, 'quick', query] as const;

/** Top-bar records-only quick search (≤6 hits). The caller passes an already-debounced query. */
export function useQuickSearch(workspaceId: WorkspaceId | undefined, query: string) {
  const trimmed = query.trim();
  const enabled = Boolean(workspaceId) && trimmed.length >= SEARCH_MIN_QUERY_LENGTH;
  return useQuery<SearchHitDto[]>({
    queryKey: workspaceId ? quickSearchKey(workspaceId, trimmed) : ['search', 'quick', 'disabled'],
    queryFn: ({ signal }) => searchRecords(workspaceId as WorkspaceId, trimmed, signal),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export const fullSearchKey = (workspaceId: WorkspaceId, query: string, page: number) =>
  ['search', workspaceId, 'full', query, page] as const;

/** Full S27 search across records + comments + attachment filenames, paginated. */
export function useFullSearch(workspaceId: WorkspaceId | undefined, query: string, page: number) {
  const trimmed = query.trim();
  const enabled = Boolean(workspaceId) && trimmed.length >= SEARCH_MIN_QUERY_LENGTH;
  return useQuery<PaginatedResponse<SearchResultDto>>({
    queryKey: workspaceId ? fullSearchKey(workspaceId, trimmed, page) : ['search', 'full', 'disabled'],
    queryFn: ({ signal }) => searchFull(workspaceId as WorkspaceId, trimmed, page, SEARCH_RESULTS_PAGE_SIZE, signal),
    enabled,
    placeholderData: (previous) => previous,
  });
}

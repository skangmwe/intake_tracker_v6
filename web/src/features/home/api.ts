// Home API call (S1 — api-contracts.md §16). One GET returns the composite HomeDto for the active
// workspace. Query string built through the shared withQuery util (web-coding-standards.md — never
// assemble query strings inline). The /api prefix is added inside apiFetch.

import type { HomeDto, WorkspaceId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';
import { withQuery } from '@/shared/http/url';

/** The caller's Home for the active workspace (BS §10.7). */
export function fetchHome(workspaceId: WorkspaceId, signal?: AbortSignal): Promise<HomeDto> {
  return apiFetch<HomeDto>(withQuery('/v1/home', { workspaceId }), signal ? { signal } : {});
}

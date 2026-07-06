// Data hook for the Home surface (TanStack Query — web-state-management.md). Keyed by the active
// workspace; disabled until one resolves (a user with no membership has no Home to load).

import { useQuery } from '@tanstack/react-query';
import type { HomeDto, WorkspaceId } from '@shared/types';

import { fetchHome } from './api';

export const homeKey = (workspaceId: WorkspaceId | null) => ['home', workspaceId] as const;

export function useHome(workspaceId: WorkspaceId | null) {
  return useQuery<HomeDto>({
    queryKey: homeKey(workspaceId),
    queryFn: ({ signal }) => fetchHome(workspaceId as WorkspaceId, signal),
    enabled: Boolean(workspaceId),
  });
}

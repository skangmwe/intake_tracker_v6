// TanStack Query read for the Platform → Workspaces list (S38). Platform-admin-gated server-side; a
// non-admin never reaches this (PlatformGate courtesy). Bounded reference list — not paginated.

import { useQuery } from '@tanstack/react-query';

import type { WorkspaceListRow } from '@shared/types';

import { fetchWorkspacesList } from './api';

export const WORKSPACES_LIST_QUERY_KEY = ['workspaces', 'list'] as const;

export function useWorkspacesList() {
  return useQuery<WorkspaceListRow[]>({
    queryKey: WORKSPACES_LIST_QUERY_KEY,
    queryFn: ({ signal }) => fetchWorkspacesList(signal),
  });
}

// TanStack Query hooks for the platform Objects / Relationships tabs (S34, B2). Server state only
// (web-state-management.md). The Objects and Workspaces reads are enabled only for a platform admin;
// Relationships is additionally gated on a selected workspace.

import { useQuery } from '@tanstack/react-query';
import type { WorkspaceId } from '@shared/types';

import {
  fetchPlatformObjects,
  fetchPlatformRelationships,
  fetchPlatformWorkspaces,
} from './platformSchema';

export const PLATFORM_OBJECTS_QUERY_KEY = ['platform-objects'] as const;

export const PLATFORM_WORKSPACES_QUERY_KEY = ['platform-workspaces'] as const;

export const platformRelationshipsQueryKey = (workspaceId: WorkspaceId) =>
  ['platform-relationships', workspaceId] as const;

/** The Global built-in objects (Request, Task) behind the S34 Objects tab. */
export function usePlatformObjects(enabled = true) {
  return useQuery({
    queryKey: PLATFORM_OBJECTS_QUERY_KEY,
    queryFn: ({ signal }) => fetchPlatformObjects(signal),
    enabled,
  });
}

/** The firm-wide workspace list behind the S34 Relationships-tab picker. */
export function usePlatformWorkspaces(enabled = true) {
  return useQuery({
    queryKey: PLATFORM_WORKSPACES_QUERY_KEY,
    queryFn: ({ signal }) => fetchPlatformWorkspaces(signal),
    enabled,
  });
}

/** One workspace's relationships behind the S34 Relationships tab. */
export function usePlatformRelationships(workspaceId: WorkspaceId | null) {
  return useQuery({
    queryKey: platformRelationshipsQueryKey(workspaceId ?? ('' as WorkspaceId)),
    queryFn: ({ signal }) => fetchPlatformRelationships(workspaceId as WorkspaceId, signal),
    enabled: Boolean(workspaceId),
  });
}

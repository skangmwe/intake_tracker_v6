// TanStack Query hooks for the platform Objects / Relationships tabs (S34, B2). Server state only
// (web-state-management.md). Both reads are enabled only for a platform admin; each hits a
// Platform-admin-gated endpoint that 403s for a non-admin.

import { useQuery } from '@tanstack/react-query';

import { fetchPlatformObjects, fetchPlatformRelationships } from './platformSchema';

export const PLATFORM_OBJECTS_QUERY_KEY = ['platform-objects'] as const;

export const PLATFORM_RELATIONSHIPS_QUERY_KEY = ['platform-relationships'] as const;

/** The Global built-in objects (Request, Task) behind the S34 Objects tab. */
export function usePlatformObjects(enabled = true) {
  return useQuery({
    queryKey: PLATFORM_OBJECTS_QUERY_KEY,
    queryFn: ({ signal }) => fetchPlatformObjects(signal),
    enabled,
  });
}

/** The canonical system-seeded relationships behind the read-only S34 Relationships tab. */
export function usePlatformRelationships(enabled = true) {
  return useQuery({
    queryKey: PLATFORM_RELATIONSHIPS_QUERY_KEY,
    queryFn: ({ signal }) => fetchPlatformRelationships(signal),
    enabled,
  });
}

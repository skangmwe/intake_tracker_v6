// TanStack Query hook for the S35 crossing map (read-only). Disabled until the caller is confirmed a
// Platform admin (the API enforces it too). Access is server-side; this only avoids a guaranteed-403
// fetch for non-admins.

import { useQuery } from '@tanstack/react-query';

import type { CrossingMapRowDto } from '@shared/types';

import { fetchCrossingMap } from './api';

export const crossingMapKey = ['platform', 'crossing-map'] as const;

export function useCrossingMap(enabled: boolean) {
  return useQuery<CrossingMapRowDto[]>({
    queryKey: crossingMapKey,
    queryFn: ({ signal }) => fetchCrossingMap(signal),
    enabled,
  });
}

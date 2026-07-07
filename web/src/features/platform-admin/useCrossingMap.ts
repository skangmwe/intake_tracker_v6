// TanStack Query hooks for the S35 crossing map (slice 24 — propose / confirm). The list + candidates
// queries are disabled until the caller is confirmed a Platform admin (the API enforces it too — this
// only avoids a guaranteed-403 fetch). The propose / confirm mutations invalidate both on success so the
// table and the candidate pickers refresh. ApiError (400/409) propagates so the form can show the message.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  CrossingCandidatesDto,
  CrossingMapProposeRequest,
  CrossingMapRowDto,
} from '@shared/types';

import {
  confirmCrossingMap,
  fetchCrossingCandidates,
  fetchCrossingMap,
  proposeCrossingMap,
} from './api';

export const crossingMapKey = ['platform', 'crossing-map'] as const;
export const crossingCandidatesKey = ['platform', 'crossing-map', 'candidates'] as const;

export function useCrossingMap(enabled: boolean) {
  return useQuery<CrossingMapRowDto[]>({
    queryKey: crossingMapKey,
    queryFn: ({ signal }) => fetchCrossingMap(signal),
    enabled,
  });
}

export function useCrossingCandidates(enabled: boolean) {
  return useQuery<CrossingCandidatesDto>({
    queryKey: crossingCandidatesKey,
    queryFn: ({ signal }) => fetchCrossingCandidates(signal),
    enabled,
  });
}

function useCrossingInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: crossingMapKey });
    void queryClient.invalidateQueries({ queryKey: crossingCandidatesKey });
  };
}

export function useProposeCrossingMap() {
  const invalidate = useCrossingInvalidation();
  return useMutation<CrossingMapRowDto, Error, CrossingMapProposeRequest>({
    mutationFn: (body) => proposeCrossingMap(body),
    onSuccess: invalidate,
  });
}

export function useConfirmCrossingMap() {
  const invalidate = useCrossingInvalidation();
  return useMutation<CrossingMapRowDto, Error, string>({
    mutationFn: (crossingMapId) => confirmCrossingMap(crossingMapId),
    onSuccess: invalidate,
  });
}

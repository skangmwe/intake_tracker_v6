// TanStack Query hooks for the Feature Catalog (S9/S10/S13) — web-state-management.md. Query-key
// factories are exported so pages and tests can target/invalidate precisely.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  AddToCatalogResult,
  FeatureCreateRequest,
  FeatureDto,
  FeatureListRow,
  FeaturePatchRequest,
  PaginatedQuery,
  PaginatedResponse,
  RecordId,
} from '@shared/types';

import {
  addToCatalog,
  createFeature,
  deprecateFeature,
  fetchFeature,
  patchFeature,
  publishFeature,
  queryFeatures,
} from './api';

export const featuresListKey = (query: PaginatedQuery) => ['features', query] as const;
export const featureKey = (recordId: RecordId) => ['feature', recordId] as const;

/** The Feature Catalog list (S9). Access-respecting, paginated, filtered/sorted server-side. */
export function useFeaturesList(query: PaginatedQuery) {
  return useQuery<PaginatedResponse<FeatureListRow>>({
    queryKey: featuresListKey(query),
    queryFn: ({ signal }) => queryFeatures(query, signal),
  });
}

/** A single feature (S10). */
export function useFeature(recordId: RecordId | undefined) {
  return useQuery<FeatureDto>({
    queryKey: recordId ? featureKey(recordId) : ['feature', 'disabled'],
    queryFn: ({ signal }) => fetchFeature(recordId as RecordId, signal),
    enabled: Boolean(recordId),
  });
}

/** Create a feature (S13 submit). Invalidates the catalog list on success. */
export function useCreateFeature() {
  const queryClient = useQueryClient();
  return useMutation<FeatureDto, Error, FeatureCreateRequest>({
    mutationFn: (request) => createFeature(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['features'] });
    },
  });
}

/** Edit a feature (S10). Adopts the fresh record; invalidates the list. */
export function usePatchFeature(recordId: RecordId) {
  const queryClient = useQueryClient();
  return useMutation<FeatureDto, Error, FeaturePatchRequest>({
    mutationFn: (request) => patchFeature(recordId, request),
    onSuccess: (fresh) => {
      queryClient.setQueryData(featureKey(recordId), fresh);
      void queryClient.invalidateQueries({ queryKey: ['features'] });
    },
  });
}

/** Publish or deprecate a feature (S10). Adopts the fresh record; invalidates the list. */
export function useSetFeatureMaturity(recordId: RecordId) {
  const queryClient = useQueryClient();
  return useMutation<FeatureDto, Error, 'publish' | 'deprecate'>({
    mutationFn: (action) =>
      action === 'publish' ? publishFeature(recordId) : deprecateFeature(recordId),
    onSuccess: (fresh) => {
      queryClient.setQueryData(featureKey(recordId), fresh);
      void queryClient.invalidateQueries({ queryKey: ['features'] });
    },
  });
}

/** Add-to-catalog (S13 entry) — prefills a Feature draft from a shipped Request. */
export function useAddToCatalog() {
  return useMutation<AddToCatalogResult, Error, RecordId>({
    mutationFn: (sourceRecordId) => addToCatalog(sourceRecordId),
  });
}

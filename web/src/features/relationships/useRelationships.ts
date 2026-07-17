// TanStack Query hooks for the Relationships admin surface (Slice 25). Server state only
// (web-state-management.md); mutations invalidate the workspace's relationships query so
// the S30 admin table refreshes.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  RelationshipCreateRequest,
  RelationshipDto,
  RelationshipId,
  RelationshipPatchRequest,
  RelationshipRetireResponse,
  WorkspaceId,
} from '@shared/types';

import {
  createRelationship,
  fetchRelationships,
  patchRelationship,
  restoreRelationship,
  retireRelationship,
} from './api';

export const relationshipsQueryKey = (workspaceId: WorkspaceId) =>
  ['relationships', workspaceId] as const;

export function useWorkspaceRelationships(workspaceId: WorkspaceId | undefined) {
  return useQuery<RelationshipDto[]>({
    queryKey: relationshipsQueryKey(workspaceId ?? ('' as WorkspaceId)),
    queryFn: ({ signal }) => fetchRelationships(workspaceId as WorkspaceId, signal),
    enabled: Boolean(workspaceId),
  });
}

export function useCreateRelationship(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();
  return useMutation<RelationshipDto, Error, RelationshipCreateRequest>({
    mutationFn: (request) => createRelationship(workspaceId, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: relationshipsQueryKey(workspaceId) }),
  });
}

interface PatchInput {
  relationshipId: RelationshipId;
  request: RelationshipPatchRequest;
}

export function usePatchRelationship(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();
  return useMutation<RelationshipDto, Error, PatchInput>({
    mutationFn: ({ relationshipId, request }) =>
      patchRelationship(relationshipId, workspaceId, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: relationshipsQueryKey(workspaceId) }),
  });
}

interface RetireInput {
  relationshipId: RelationshipId;
  force: boolean;
}

export function useRetireRelationship(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();
  return useMutation<RelationshipRetireResponse, Error, RetireInput>({
    mutationFn: ({ relationshipId, force }) =>
      retireRelationship(relationshipId, workspaceId, force),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: relationshipsQueryKey(workspaceId) }),
  });
}

export function useRestoreRelationship(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();
  return useMutation<RelationshipDto, Error, RelationshipId>({
    mutationFn: (relationshipId) => restoreRelationship(relationshipId, workspaceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: relationshipsQueryKey(workspaceId) }),
  });
}

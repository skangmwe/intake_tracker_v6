// TanStack Query hooks for the S37 role-label catalog. The list query drives the surface; the create /
// rename / retire mutations invalidate it on success so the list reflects the change. ApiError (400
// blank, 409 duplicate, 404 unknown) propagates so the form / row can show the API's message.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { RoleLabelDto } from '@shared/types';

import { createRoleLabel, fetchRoleLabels, renameRoleLabel, retireRoleLabel } from './api';

export const roleLabelsKey = ['platform', 'role-labels'] as const;

export function useRoleLabels(enabled: boolean) {
  return useQuery<RoleLabelDto[]>({
    queryKey: roleLabelsKey,
    queryFn: ({ signal }) => fetchRoleLabels(signal),
    enabled,
  });
}

export function useCreateRoleLabel() {
  const queryClient = useQueryClient();
  return useMutation<RoleLabelDto, Error, string>({
    mutationFn: (label) => createRoleLabel({ label }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roleLabelsKey }),
  });
}

export function useRenameRoleLabel() {
  const queryClient = useQueryClient();
  return useMutation<RoleLabelDto, Error, { roleLabelId: string; label: string }>({
    mutationFn: ({ roleLabelId, label }) => renameRoleLabel(roleLabelId, { label }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roleLabelsKey }),
  });
}

export function useRetireRoleLabel() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (roleLabelId) => retireRoleLabel(roleLabelId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roleLabelsKey }),
  });
}

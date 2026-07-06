// TanStack Query hooks for the S36 access-provisioning directory. The list query drives the table; the
// grant / revoke mutations invalidate it on success. ApiError (400 unresolved/ambiguous) propagates so
// the grant form can show the API's plain-language message.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { PlatformAdminGrantRequest, PrivilegedGrantsListDto, UserId } from '@shared/types';

import { fetchAccessGrants, grantAccess, revokeAccess } from './api';

export const accessGrantsKey = ['platform', 'access-grants'] as const;

export function useAccessGrants(enabled: boolean) {
  return useQuery<PrivilegedGrantsListDto>({
    queryKey: accessGrantsKey,
    queryFn: ({ signal }) => fetchAccessGrants(signal),
    enabled,
  });
}

export function useGrantAccess() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, PlatformAdminGrantRequest>({
    mutationFn: (body) => grantAccess(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accessGrantsKey }),
  });
}

export function useRevokeAccess() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UserId>({
    mutationFn: (userId) => revokeAccess(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accessGrantsKey }),
  });
}

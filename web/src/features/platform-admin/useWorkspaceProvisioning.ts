// TanStack Query mutation for S38 workspace provisioning (BS §1.1). Clones the PG/Dept template into a
// new PG workspace. ApiError (400 duplicate-prefix / unresolved-admin, 409, 503) propagates so the
// wizard can surface the API's plain-language message. The user's own memberships are read from
// /users/me, so a successful provision invalidates that key to reflect the new admin membership.

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { WorkspaceProvisionRequest, WorkspaceProvisionResult } from '@shared/types';

import { ME_QUERY_KEY } from '@/features/users/useMe';

import { provisionWorkspace } from './api';

export function useProvisionWorkspace() {
  const queryClient = useQueryClient();
  return useMutation<WorkspaceProvisionResult, Error, WorkspaceProvisionRequest>({
    mutationFn: (body) => provisionWorkspace(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
  });
}

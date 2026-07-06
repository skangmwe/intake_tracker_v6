// Shared gate for the platform-admin surfaces (S34–S39). Resolves the caller's additive Platform-admin
// grant from GET /users/me. The API is the boundary (403 for non-admins) — this drives the UI courtesy
// gate and the nav visibility, not access itself.

import { useMe } from '@/features/users/useMe';

export interface PlatformAdminGate {
  isPlatformAdmin: boolean;
  isLoading: boolean;
  isError: boolean;
}

export function usePlatformAdmin(): PlatformAdminGate {
  const { data: me, isLoading, isError } = useMe();
  return {
    isPlatformAdmin: me?.isPlatformAdmin ?? false,
    isLoading,
    isError,
  };
}

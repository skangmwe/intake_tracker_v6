// Single TanStack Query client for the app (web-state-management.md). Retries are limited so
// a 401/403 doesn't loop; auth failures are surfaced, not retried.

import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './http/apiClient';

const MAX_QUERY_RETRIES = 1;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // Never retry auth/authorization/not-found — retrying can't fix them.
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
          return false;
        }
        return failureCount < MAX_QUERY_RETRIES;
      },
    },
    mutations: { retry: false },
  },
});

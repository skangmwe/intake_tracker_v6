import { QueryClient } from '@tanstack/react-query';

import { queryClient } from './queryClient';
import { ApiError } from './http/apiClient';

function apiError(status: number): ApiError {
  return new ApiError(status, { type: 'about:blank', title: 'x', status, detail: 'd' });
}

describe('queryClient', () => {
  it('queryClient — configured with a 30s stale time and no mutation retries', () => {
    // Assert
    expect(queryClient).toBeInstanceOf(QueryClient);
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(30_000);
    expect(defaults.mutations?.retry).toBe(false);
  });

  it('queryClient — retry — never retries auth/authorization/not-found', () => {
    // Arrange
    const retry = queryClient.getDefaultOptions().queries?.retry as (n: number, e: Error) => boolean;

    // Assert — 401/403/404 are terminal; retrying can't fix them.
    expect(retry(0, apiError(401))).toBe(false);
    expect(retry(0, apiError(403))).toBe(false);
    expect(retry(0, apiError(404))).toBe(false);
  });

  it('queryClient — retry — retries transient failures up to the cap then stops', () => {
    // Arrange
    const retry = queryClient.getDefaultOptions().queries?.retry as (n: number, e: Error) => boolean;

    // Assert
    expect(retry(0, new Error('network'))).toBe(true); // first failure retries
    expect(retry(1, new Error('network'))).toBe(false); // cap reached
    expect(retry(0, apiError(500))).toBe(true); // 5xx is retryable
  });
});

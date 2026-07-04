// Extracts a user-facing message from a query/mutation error. ApiError carries the API's
// plain-language ProblemDetails detail (api-error-handling.md); anything else uses the fallback.
// Never surfaces a raw stack or status code (web-coding-standards.md). Shared: consumed by the
// requests and comments features (extracted here once a second consumer appeared — shared discipline).

import { ApiError } from '@/shared/http/apiClient';

export function problemMessage(
  error: unknown,
  fallback = 'Something went wrong. Try again in a moment.',
): string {
  if (error instanceof ApiError) {
    return error.problem.detail;
  }
  return fallback;
}

// Extracts a user-facing message from a mutation/query error. ApiError carries the API's
// plain-language ProblemDetails detail (api-error-handling.md); anything else falls back to a
// generic line. Never surfaces a raw stack or status code to the user.

import { ApiError } from '@/shared/http/apiClient';

export function problemMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.problem.detail;
  }

  return 'Something went wrong saving your change. Try again in a moment.';
}

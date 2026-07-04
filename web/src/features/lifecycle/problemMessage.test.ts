// Unit tests for problemMessage — surfaces the API's plain-language detail, never a raw error.

import { ApiError } from '@/shared/http/apiClient';

import { problemMessage } from './problemMessage';

describe('problemMessage', () => {
  it('returns the ProblemDetails detail for an ApiError', () => {
    const error = new ApiError(400, {
      type: 'https://mws.ai/errors/validation',
      title: 'Invalid',
      status: 400,
      detail: 'No active member of this workspace matches that name or email.',
    });
    expect(problemMessage(error)).toBe('No active member of this workspace matches that name or email.');
  });

  it('falls back to a generic message for a non-ApiError', () => {
    expect(problemMessage(new Error('boom'))).toMatch(/try again/i);
  });
});

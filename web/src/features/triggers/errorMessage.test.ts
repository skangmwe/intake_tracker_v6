// Unit tests for the trigger error-message extractor.

import { ApiError } from '@/shared/http/apiClient';

import { triggerProblemMessage } from './errorMessage';

describe('triggerProblemMessage', () => {
  it('ApiError — returns the ProblemDetails detail', () => {
    // Arrange
    const error = new ApiError(400, {
      type: 'about:blank',
      title: 'Invalid',
      status: 400,
      detail: 'Choose at least one recipient.',
    });

    // Act / Assert
    expect(triggerProblemMessage(error)).toBe('Choose at least one recipient.');
  });

  it('non-ApiError — returns a generic fallback', () => {
    expect(triggerProblemMessage(new Error('boom'))).toMatch(/went wrong saving this trigger/i);
  });
});

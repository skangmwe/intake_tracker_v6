// Unit tests for the error → user-message extractor (no React, no network).

import { ApiError } from '@/shared/http/apiClient';

import { problemMessage } from './problemMessage';

describe('problemMessage', () => {
  it('problemMessage — ApiError — surfaces the ProblemDetails detail', () => {
    // Arrange
    const error = new ApiError(409, {
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail: 'That name is already taken.',
    });

    // Act
    const message = problemMessage(error);

    // Assert
    expect(message).toBe('That name is already taken.');
  });

  it('problemMessage — non-ApiError — returns the default fallback', () => {
    // Arrange / Act
    const message = problemMessage(new Error('boom'));

    // Assert
    expect(message).toBe('Something went wrong. Try again in a moment.');
  });

  it('problemMessage — non-ApiError with a custom fallback — returns the custom fallback', () => {
    // Arrange / Act
    const message = problemMessage(undefined, 'Requests could not be loaded.');

    // Assert
    expect(message).toBe('Requests could not be loaded.');
  });
});

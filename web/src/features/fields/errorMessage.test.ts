// Unit tests for the field error-message extractor.

import { ApiError } from '@/shared/http/apiClient';

import { problemMessage } from './errorMessage';

describe('problemMessage', () => {
  it('problemMessage — ApiError — returns the ProblemDetails detail', () => {
    // Arrange
    const error = new ApiError(400, {
      type: 'https://mws.ai/errors/validation',
      title: 'Invalid',
      status: 400,
      detail: 'A field rule chain is too deep.',
    });

    // Act + Assert
    expect(problemMessage(error)).toBe('A field rule chain is too deep.');
  });

  it('problemMessage — unknown error — returns the generic fallback', () => {
    expect(problemMessage(new Error('boom'))).toMatch(/try again/i);
  });
});

import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { ErrorBoundary } from './ErrorBoundary';
import { trackException } from './appInsights';

jest.mock('./appInsights', () => ({ trackException: jest.fn() }));

function Boom(): never {
  throw new Error('render exploded');
}

describe('ErrorBoundary', () => {
  // React logs caught render errors to console.error; silence it for these tests.
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  afterAll(() => consoleError.mockRestore());
  beforeEach(() => jest.clearAllMocks());

  it('ErrorBoundary — child renders — passes children through', () => {
    // Act
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );

    // Assert
    expect(screen.getByText('all good')).toBeInTheDocument();
    expect(trackException).not.toHaveBeenCalled();
  });

  it('ErrorBoundary — child throws — shows the fallback and reports the error', () => {
    // Act
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    // Assert
    expect(screen.getByRole('heading', { name: 'Something went wrong.' })).toBeInTheDocument();
    expect(trackException).toHaveBeenCalledTimes(1);
    expect((trackException as jest.Mock).mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('ErrorBoundary — custom fallback — renders it instead of the default', () => {
    // Act
    render(
      <ErrorBoundary fallback={<p>custom fallback</p>}>
        <Boom />
      </ErrorBoundary>,
    );

    // Assert
    expect(screen.getByText('custom fallback')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Something went wrong.' })).not.toBeInTheDocument();
  });

  it('ErrorBoundary — no axe violations in the error state', async () => {
    // Arrange
    const { container } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    // Assert
    expect(await axe(container)).toHaveNoViolations();
  });
});

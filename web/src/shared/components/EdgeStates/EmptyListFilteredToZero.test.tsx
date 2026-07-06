// Tests for EmptyListFilteredToZero (S42) — the bordered filtered-to-zero card. Verifies the default
// copy, the bordered (non-pale) variant class, the Clear-filters callback, and axe-cleanliness.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import { EmptyListFilteredToZero } from './EmptyListFilteredToZero';

expect.extend(toHaveNoViolations);

describe('EmptyListFilteredToZero', () => {
  it('EmptyListFilteredToZero — default copy renders on the bordered (non-pale) variant', () => {
    // Arrange / Act
    render(<EmptyListFilteredToZero onClearFilters={jest.fn()} />);

    // Assert
    const heading = screen.getByRole('heading', { name: 'No matches for these filters' });
    const section = heading.closest('section');
    expect(section).toHaveClass('mws-empty', 'mws-empty--filtered');
    expect(section).not.toHaveClass('mws-empty--zero');
    expect(section).toHaveAttribute('data-ds', 'empty-filtered');
  });

  it('EmptyListFilteredToZero — Clear filters invokes the handler', async () => {
    // Arrange
    const onClearFilters = jest.fn();
    render(<EmptyListFilteredToZero onClearFilters={onClearFilters} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    // Assert
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('EmptyListFilteredToZero — accepts custom title, message, and clear label', () => {
    // Arrange / Act
    render(
      <EmptyListFilteredToZero
        onClearFilters={jest.fn()}
        title="No records in range"
        message="Try widening the date range."
        clearLabel="Reset filters"
      />,
    );

    // Assert
    expect(screen.getByRole('heading', { name: 'No records in range' })).toBeInTheDocument();
    expect(screen.getByText('Try widening the date range.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset filters' })).toBeInTheDocument();
  });

  it('EmptyListFilteredToZero — no axe violations', async () => {
    // Arrange / Act
    const { container } = render(<EmptyListFilteredToZero onClearFilters={jest.fn()} />);

    // Assert
    expect(await axe(container)).toHaveNoViolations();
  });
});

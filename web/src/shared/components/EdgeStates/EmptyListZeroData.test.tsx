// Tests for EmptyListZeroData (S41) — the zero-data ceremony. Verifies title/message/action render,
// the pale-fill variant class, optional action, and axe-cleanliness.

import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import { Button } from '@/shared/components/Button';

import { EmptyListZeroData } from './EmptyListZeroData';

expect.extend(toHaveNoViolations);

describe('EmptyListZeroData', () => {
  it('EmptyListZeroData — renders title, message, and a primary action on the pale variant', () => {
    // Arrange / Act
    render(
      <EmptyListZeroData
        title="No requests yet"
        message="Create your first request to start tracking work."
        action={<Button variant="primary">Create your first request</Button>}
      />,
    );

    // Assert
    expect(screen.getByRole('heading', { name: 'No requests yet' })).toBeInTheDocument();
    expect(
      screen.getByText('Create your first request to start tracking work.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create your first request' })).toBeInTheDocument();
    const section = screen.getByRole('heading', { name: 'No requests yet' }).closest('section');
    expect(section).toHaveClass('mws-empty', 'mws-empty--zero');
    expect(section).toHaveAttribute('data-ds', 'empty-zero');
  });

  it('EmptyListZeroData — action is optional (read-only lists render no CTA)', () => {
    // Arrange / Act
    render(<EmptyListZeroData title="No features yet" message="Nothing here yet." />);

    // Assert
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('EmptyListZeroData — no axe violations', async () => {
    // Arrange / Act
    const { container } = render(
      <EmptyListZeroData
        title="No requests yet"
        message="Create your first request to start tracking work."
        action={<Button variant="primary">Create your first request</Button>}
      />,
    );

    // Assert
    expect(await axe(container)).toHaveNoViolations();
  });
});

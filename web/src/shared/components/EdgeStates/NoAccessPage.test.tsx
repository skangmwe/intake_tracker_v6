// Tests for NoAccessPage (S40) — the uniform read-blocked surface. Verifies it never reveals record
// existence (no ID, no title, no "not found"), routes Home via the CTA, and is axe-clean.

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import { renderWithProviders } from '@/test-utils';

import { NoAccessPage } from './NoAccessPage';

expect.extend(toHaveNoViolations);

describe('NoAccessPage', () => {
  it('NoAccessPage — default noun — renders the access message and Home CTA', () => {
    // Arrange / Act
    renderWithProviders(<NoAccessPage />);

    // Assert
    expect(screen.getByText('You don’t have access to this record.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to Home' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('data-ds', 'no-access');
  });

  it('NoAccessPage — never reveals existence — no id, title, or not-found copy', () => {
    // Arrange / Act
    const { container } = renderWithProviders(<NoAccessPage resourceNoun="feature" />);

    // Assert — existence is never disclosed (BS §22.6)
    expect(container.textContent).not.toMatch(/not found/i);
    expect(container.textContent).not.toMatch(/does(n't| not) exist/i);
    expect(screen.getByText('You don’t have access to this feature.')).toBeInTheDocument();
  });

  it('NoAccessPage — CTA calls the supplied onGoHome handler', async () => {
    // Arrange
    const onGoHome = jest.fn();
    renderWithProviders(<NoAccessPage onGoHome={onGoHome} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Go to Home' }));

    // Assert
    expect(onGoHome).toHaveBeenCalledTimes(1);
  });

  it('NoAccessPage — no axe violations', async () => {
    // Arrange / Act
    const { container } = renderWithProviders(<NoAccessPage />);

    // Assert
    expect(await axe(container)).toHaveNoViolations();
  });
});

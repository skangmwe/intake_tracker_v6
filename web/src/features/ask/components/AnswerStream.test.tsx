// Behaviour + a11y tests for the assistant answer turn. Covers streaming, an answered turn with an inline
// citation + source list + feedback, and the error state. axe runs on each meaningfully different state.

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { renderWithProviders } from '@/test-utils';

import type { AskTurn } from '../types';
import { AnswerStream } from './AnswerStream';

function assistantTurn(overrides: Partial<AskTurn> = {}): AskTurn {
  return {
    id: 't1',
    role: 'assistant',
    text: '',
    citations: [],
    isStreaming: false,
    ...overrides,
  };
}

describe('AnswerStream', () => {
  it('AnswerStream — streaming — shows text and no feedback yet, no violations', async () => {
    // Arrange / Act
    const { container } = renderWithProviders(
      <AnswerStream turn={assistantTurn({ text: 'Working on it', isStreaming: true })} onRate={jest.fn()} />,
    );

    // Assert
    expect(screen.getByText(/working on it/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /helpful/i })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('AnswerStream — answered with a citation — renders an inline source link and feedback', async () => {
    // Arrange
    const user = userEvent.setup();
    const onRate = jest.fn();
    const turn = assistantTurn({
      text: 'Retention is handled [cite:1].',
      citations: [{ marker: 1, recordId: 'LIT-9004', title: 'Retention helper' }],
      messageId: 'm1',
    });
    const { container } = renderWithProviders(<AnswerStream turn={turn} onRate={onRate} />);

    // Act
    await user.click(screen.getByRole('button', { name: /^helpful$/i }));

    // Assert - inline citation link + source list + feedback wired.
    expect(screen.getByRole('link', { name: /source 1: retention helper/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\[1\] retention helper/i })).toBeInTheDocument();
    expect(onRate).toHaveBeenCalledWith('up');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('AnswerStream — error — shows an alert and no feedback, no violations', async () => {
    // Arrange / Act
    const { container } = renderWithProviders(
      <AnswerStream turn={assistantTurn({ error: 'The answer was interrupted. Try again.', messageId: 'm1' })} onRate={jest.fn()} />,
    );

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(/interrupted/i);
    expect(screen.queryByRole('button', { name: /helpful/i })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

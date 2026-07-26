// Behaviour + a11y tests for the Ask composer. Covers the empty-state suggestions, typing + submit, the
// disabled/Stop streaming state, and axe on both the idle and streaming states.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { AskComposer } from './AskComposer';

describe('AskComposer', () => {
  it('AskComposer — empty state — shows sendable suggestions and no violations', async () => {
    // Arrange
    const onAsk = jest.fn();
    const { container } = render(
      <AskComposer isStreaming={false} showSuggestions onAsk={onAsk} onStop={jest.fn()} />,
    );

    // Act
    await userEvent.setup().click(screen.getByRole('button', { name: /which requests mention data retention/i }));

    // Assert
    expect(onAsk).toHaveBeenCalledWith('Which requests mention data retention?');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('AskComposer — type and submit — sends the question and clears the input', async () => {
    // Arrange
    const user = userEvent.setup();
    const onAsk = jest.fn();
    render(<AskComposer isStreaming={false} showSuggestions={false} onAsk={onAsk} onStop={jest.fn()} />);
    const input = screen.getByRole('textbox', { name: /ask a question/i });

    // Act
    await user.type(input, 'find retention');
    await user.click(screen.getByRole('button', { name: /send/i }));

    // Assert
    expect(onAsk).toHaveBeenCalledWith('find retention');
    expect(input).toHaveValue('');
  });

  it('AskComposer — empty input — disables Send', () => {
    // Arrange / Act
    render(<AskComposer isStreaming={false} showSuggestions={false} onAsk={jest.fn()} onStop={jest.fn()} />);

    // Assert
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  it('AskComposer — streaming — shows Stop, disables input, no violations', async () => {
    // Arrange
    const user = userEvent.setup();
    const onStop = jest.fn();
    const { container } = render(
      <AskComposer isStreaming showSuggestions={false} onAsk={jest.fn()} onStop={onStop} />,
    );

    // Act
    await user.click(screen.getByRole('button', { name: /stop/i }));

    // Assert
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: /ask a question/i })).toBeDisabled();
    expect(await axe(container)).toHaveNoViolations();
  });
});

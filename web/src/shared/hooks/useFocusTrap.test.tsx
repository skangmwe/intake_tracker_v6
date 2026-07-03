import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useFocusTrap } from './useFocusTrap';

function Harness({ active, onEscape }: { active: boolean; onEscape: () => void }) {
  const ref = useFocusTrap<HTMLDivElement>(active, onEscape);
  return (
    <div>
      <button type="button">before</button>
      <div ref={ref} data-testid="trap">
        <button type="button">first</button>
        <button type="button">last</button>
      </div>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('useFocusTrap — activated — focuses the first element in the container', () => {
    // Act
    render(<Harness active onEscape={jest.fn()} />);

    // Assert
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
  });

  it('useFocusTrap — Escape — calls onEscape', async () => {
    // Arrange
    const onEscape = jest.fn();
    const user = userEvent.setup();
    render(<Harness active onEscape={onEscape} />);

    // Act
    await user.keyboard('{Escape}');

    // Assert
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('useFocusTrap — Tab past the last element — wraps to the first', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness active onEscape={jest.fn()} />);
    screen.getByRole('button', { name: 'last' }).focus();

    // Act
    await user.tab();

    // Assert
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
  });

  it('useFocusTrap — inactive — does not steal focus', () => {
    // Act
    render(<Harness active={false} onEscape={jest.fn()} />);

    // Assert — first element is not auto-focused when the trap is inactive.
    expect(screen.getByRole('button', { name: 'first' })).not.toHaveFocus();
  });
});

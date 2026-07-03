import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useDismissable } from './useDismissable';

function Harness() {
  const [open, setOpen] = useState(true);
  const ref = useDismissable<HTMLDivElement>(open, () => setOpen(false));
  return (
    <div>
      <div ref={ref}>
        <button type="button">inside</button>
        {open && <span>content</span>}
      </div>
      <button type="button">outside</button>
    </div>
  );
}

describe('useDismissable', () => {
  it('useDismissable — click outside — closes', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText('content')).toBeInTheDocument();

    // Act
    await user.click(screen.getByRole('button', { name: 'outside' }));

    // Assert
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('useDismissable — click inside — stays open', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness />);

    // Act
    await user.click(screen.getByRole('button', { name: 'inside' }));

    // Assert
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('useDismissable — Escape — closes', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness />);

    // Act
    await user.keyboard('{Escape}');

    // Assert
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });
});

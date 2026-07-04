import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { Button } from './Button';

describe('Button', () => {
  it('Button — default variant — renders a primary button with its label', () => {
    render(<Button>Save field</Button>);
    const button = screen.getByRole('button', { name: 'Save field' });
    expect(button).toHaveClass('mws-btn', 'mws-btn--primary');
    expect(button).toHaveAttribute('data-ds', 'btn');
  });

  it('Button — secondary compact — applies the compact and secondary classes', () => {
    render(
      <Button variant="secondary" compact>
        Cancel
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('mws-btn--secondary', 'mws-btn--sm');
  });

  it('Button — clicked — invokes onClick', async () => {
    // Arrange
    const onClick = jest.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Go</Button>);

    // Act
    await user.click(screen.getByRole('button', { name: 'Go' }));

    // Assert
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('Button — disabled — does not invoke onClick', async () => {
    const onClick = jest.fn();
    const user = userEvent.setup();
    render(
      <Button onClick={onClick} disabled>
        Go
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('Button — no axe violations across variants', async () => {
    const { container } = render(
      <>
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="destructive" disabled>
          Destructive
        </Button>
      </>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { TextField } from './TextField';

function Harness({ optional, error, hint }: { optional?: boolean; error?: string; hint?: string }) {
  const [value, setValue] = useState('');
  return (
    <TextField
      label="Request name"
      value={value}
      onChange={setValue}
      optional={optional}
      error={error}
      hint={hint}
    />
  );
}

describe('TextField', () => {
  it('TextField — associates the label with the input', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Request name')).toBeInTheDocument();
  });

  it('TextField — typing updates the value', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness />);

    // Act
    await user.type(screen.getByLabelText('Request name'), 'Contract review');

    // Assert
    expect(screen.getByLabelText('Request name')).toHaveValue('Contract review');
  });

  it('TextField — optional fields are marked, not required ones', () => {
    render(<Harness optional />);
    expect(screen.getByText('(optional)')).toBeInTheDocument();
  });

  it('TextField — error replaces the helper and wires aria', () => {
    render(<Harness error="Enter a request name" hint="Shown to reviewers" />);
    const input = screen.getByLabelText('Request name');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a request name');
    expect(screen.queryByText('Shown to reviewers')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a request name');
  });

  it('TextField — no axe violations in default and error states', async () => {
    const { container } = render(
      <>
        <Harness />
        <Harness error="Enter a request name" />
      </>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

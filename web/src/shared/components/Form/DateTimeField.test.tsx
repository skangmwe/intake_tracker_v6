import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { DateTimeField } from './DateTimeField';

function Harness({ error }: { error?: string }) {
  const [value, setValue] = useState('');
  return (
    <DateTimeField label="Publish date & time" value={value} onChange={setValue} error={error} />
  );
}

describe('DateTimeField', () => {
  it('DateTimeField — renders a native datetime-local input associated with its label', () => {
    // Arrange / Act
    render(<Harness />);

    // Assert
    expect(screen.getByLabelText('Publish date & time')).toHaveAttribute('type', 'datetime-local');
  });

  it('DateTimeField — accepts a date-time value', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness />);

    // Act
    const field = screen.getByLabelText('Publish date & time');
    await user.type(field, '2026-08-01T09:30');

    // Assert
    expect(field).toHaveValue('2026-08-01T09:30');
  });

  it('DateTimeField — error state sets aria-invalid and an alert', () => {
    // Arrange / Act
    render(<Harness error="Pick a date and time in the future." />);

    // Assert
    expect(screen.getByLabelText('Publish date & time')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Pick a date and time in the future.');
  });

  it('DateTimeField — no axe violations in default and error states', async () => {
    // Arrange / Act
    const clean = render(<Harness />);
    // Assert
    expect(await axe(clean.container)).toHaveNoViolations();

    // Act
    const invalid = render(<Harness error="Pick a date and time in the future." />);
    // Assert
    expect(await axe(invalid.container)).toHaveNoViolations();
  });
});

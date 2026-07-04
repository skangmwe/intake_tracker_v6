import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { DateField } from './DateField';

function Harness({ error }: { error?: string }) {
  const [value, setValue] = useState('');
  return <DateField label="Target date" value={value} onChange={setValue} error={error} />;
}

describe('DateField', () => {
  it('DateField — renders a native date input associated with its label', () => {
    render(<Harness />);
    const field = screen.getByLabelText('Target date');
    expect(field).toHaveAttribute('type', 'date');
  });

  it('DateField — accepts a date value', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const field = screen.getByLabelText('Target date');
    await user.type(field, '2026-08-01');
    expect(field).toHaveValue('2026-08-01');
  });

  it('DateField — error state sets aria-invalid and an alert', () => {
    render(<Harness error="Pick a valid date" />);
    expect(screen.getByLabelText('Target date')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Pick a valid date');
  });

  it('DateField — no axe violations', async () => {
    const { container } = render(<Harness />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

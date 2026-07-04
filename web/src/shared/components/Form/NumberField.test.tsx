import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { NumberField } from './NumberField';

function Harness() {
  const [value, setValue] = useState('');
  return <NumberField label="Business value" value={value} onChange={setValue} optional />;
}

describe('NumberField', () => {
  it('NumberField — uses a numeric inputmode instead of a stepper', () => {
    render(<Harness />);
    expect(screen.getByLabelText(/Business value/)).toHaveAttribute('inputmode', 'numeric');
  });

  it('NumberField — accepts numeric input', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const field = screen.getByLabelText(/Business value/);
    await user.type(field, '42');
    expect(field).toHaveValue('42');
  });

  it('NumberField — marks the optional field', () => {
    render(<Harness />);
    expect(screen.getByText('(optional)')).toBeInTheDocument();
  });

  it('NumberField — no axe violations', async () => {
    const { container } = render(<Harness />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

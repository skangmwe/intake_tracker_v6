import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { Select, type SelectOption } from './Select';

const OPTIONS: SelectOption[] = [
  { value: 'build', label: 'Full build' },
  { value: 'advice', label: 'Advice only' },
];

function Harness({ placeholder }: { placeholder?: string }) {
  const [value, setValue] = useState('');
  return (
    <Select
      label="Request type"
      value={value}
      onChange={setValue}
      options={OPTIONS}
      placeholder={placeholder}
    />
  );
}

describe('Select', () => {
  it('Select — associates the label with the control', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Request type')).toBeInTheDocument();
  });

  it('Select — renders a disabled placeholder option when provided', () => {
    render(<Harness placeholder="Choose a type" />);
    const placeholder = screen.getByRole('option', { name: 'Choose a type' });
    expect(placeholder).toBeDisabled();
  });

  it('Select — selecting an option updates the value', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.selectOptions(screen.getByLabelText('Request type'), 'advice');
    expect(screen.getByLabelText('Request type')).toHaveValue('advice');
  });

  it('Select — no axe violations', async () => {
    const { container } = render(<Harness placeholder="Choose a type" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

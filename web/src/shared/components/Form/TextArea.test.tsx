import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { TextArea } from './TextArea';

function Harness({ error }: { error?: string }) {
  const [value, setValue] = useState('');
  return <TextArea label="Description" value={value} onChange={setValue} error={error} />;
}

describe('TextArea', () => {
  it('TextArea — associates the label and accepts input', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const field = screen.getByLabelText('Description');
    await user.type(field, 'Needs partner review');
    expect(field).toHaveValue('Needs partner review');
  });

  it('TextArea — error state sets aria-invalid and an alert', () => {
    render(<Harness error="Description is required" />);
    expect(screen.getByLabelText('Description')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Description is required');
  });

  it('TextArea — no axe violations', async () => {
    const { container } = render(<Harness />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

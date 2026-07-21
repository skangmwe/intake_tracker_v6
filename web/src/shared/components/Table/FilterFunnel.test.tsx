import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { FilterFunnel, type FilterType, type FilterValue } from './FilterFunnel';

function Harness({ type, options }: { type: FilterType; options?: { value: string; label: string; count?: number }[] }) {
  const [value, setValue] = useState<FilterValue | undefined>(undefined);
  return (
    <FilterFunnel type={type} columnLabel="Stage" value={value} onChange={setValue} options={options} />
  );
}

describe('FilterFunnel', () => {
  it('FilterFunnel — opens the popover on click', async () => {
    const user = userEvent.setup();
    render(<Harness type="text" />);

    await user.click(screen.getByRole('button', { name: 'Filter Stage' }));
    expect(screen.getByRole('dialog', { name: 'Filter Stage' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('contains…')).toBeInTheDocument();
  });

  it('FilterFunnel — select type renders checkboxes with counts', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        type="select"
        options={[
          { value: 'execution', label: 'Execution', count: 12 },
          { value: 'validation', label: 'Validation', count: 3 },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Filter Stage' }));
    expect(screen.getByRole('checkbox', { name: /Execution/ })).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('FilterFunnel — number type renders the comparator input', async () => {
    const user = userEvent.setup();
    render(<Harness type="number" />);

    await user.click(screen.getByRole('button', { name: 'Filter Stage' }));
    expect(screen.getByPlaceholderText('e.g. >5 or =7')).toBeInTheDocument();
  });

  it('FilterFunnel — date type renders From and To inputs', async () => {
    const user = userEvent.setup();
    render(<Harness type="date" />);

    await user.click(screen.getByRole('button', { name: 'Filter Stage' }));
    expect(screen.getByLabelText('From')).toBeInTheDocument();
    expect(screen.getByLabelText('To')).toBeInTheDocument();
  });

  it('FilterFunnel — typing a text filter activates Clear filter, which resets it', async () => {
    const user = userEvent.setup();
    render(<Harness type="text" />);

    await user.click(screen.getByRole('button', { name: 'Filter Stage' }));
    const input = screen.getByPlaceholderText('contains…');
    await user.type(input, 'urgent');
    const clear = screen.getByRole('button', { name: 'Clear filter' });
    expect(clear).toBeEnabled();

    await user.click(clear);
    expect(screen.getByPlaceholderText('contains…')).toHaveValue('');
  });

  it('FilterFunnel — no axe violations when open', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Harness type="select" options={[{ value: 'execution', label: 'Execution', count: 2 }]} />,
    );
    await user.click(screen.getByRole('button', { name: 'Filter Stage' }));
    expect(await axe(container)).toHaveNoViolations();
  });
});

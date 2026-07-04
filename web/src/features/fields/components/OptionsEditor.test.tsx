import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { OptionsEditor, type OptionRow } from './OptionsEditor';

function Harness({ initial }: { initial: OptionRow[] }) {
  const [rows, setRows] = useState<OptionRow[]>(initial);
  return <OptionsEditor rows={rows} onChange={setRows} />;
}

describe('OptionsEditor', () => {
  it('OptionsEditor — empty — shows the empty prompt', () => {
    render(<Harness initial={[]} />);
    expect(screen.getByText(/no options yet/i)).toBeInTheDocument();
  });

  it('OptionsEditor — add option — appends an editable row', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness initial={[]} />);

    // Act
    await user.click(screen.getByRole('button', { name: /add option/i }));

    // Assert
    expect(screen.getByPlaceholderText('Value')).toBeInTheDocument();
  });

  it('OptionsEditor — remove option — drops the row', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness initial={[{ id: 'a', value: 'High', label: 'High' }]} />);

    // Act
    await user.click(screen.getByRole('button', { name: /remove option 1/i }));

    // Assert
    expect(screen.queryByDisplayValue('High')).not.toBeInTheDocument();
  });

  it('OptionsEditor — editing a value — updates the row', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness initial={[{ id: 'a', value: 'Low', label: 'Low label' }]} />);

    // Act
    const valueInput = screen.getByLabelText('Option 1 value');
    await user.type(valueInput, 'er');

    // Assert
    expect(screen.getByLabelText('Option 1 value')).toHaveValue('Lower');
  });

  it('OptionsEditor — no axe violations with rows', async () => {
    const { container } = render(<Harness initial={[{ id: 'a', value: 'High', label: 'High' }]} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

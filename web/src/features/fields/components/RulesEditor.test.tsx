import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { RulesEditor, type RuleRow } from './RulesEditor';

const FIELD_OPTIONS = [
  { key: 'existingSolution', label: 'Existing solution' },
  { key: 'deptPgClient', label: 'Dept/PG/Client' },
];

function Harness({ initial }: { initial: RuleRow[] }) {
  const [rows, setRows] = useState<RuleRow[]>(initial);
  return <RulesEditor rows={rows} fieldOptions={FIELD_OPTIONS} onChange={setRows} />;
}

const showRule: RuleRow = { id: 'r1', action: 'Show', whenFieldKey: 'existingSolution', comparator: 'eq', compareValue: 'true' };

describe('RulesEditor', () => {
  it('RulesEditor — empty — shows the empty prompt', () => {
    render(<Harness initial={[]} />);
    expect(screen.getByText(/no rules/i)).toBeInTheDocument();
  });

  it('RulesEditor — add rule — appends a rule row with a value input', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness initial={[]} />);

    // Act
    await user.click(screen.getByRole('button', { name: /add rule/i }));

    // Assert
    expect(screen.getByPlaceholderText('value')).toBeInTheDocument();
  });

  it('RulesEditor — isSet comparator — hides the value input', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness initial={[showRule]} />);

    // Act — switch the comparator to "is set".
    await user.selectOptions(screen.getByLabelText(/rule 1 comparator/i), 'isSet');

    // Assert
    expect(screen.queryByPlaceholderText('value')).not.toBeInTheDocument();
  });

  it('RulesEditor — editing the field and value — updates the row', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness initial={[showRule]} />);

    // Act
    await user.selectOptions(screen.getByLabelText(/rule 1 field/i), 'deptPgClient');
    const valueInput = screen.getByPlaceholderText('value');
    await user.clear(valueInput);
    await user.type(valueInput, 'Client');

    // Assert
    expect((screen.getByLabelText(/rule 1 field/i) as HTMLSelectElement).value).toBe('deptPgClient');
    expect(screen.getByDisplayValue('Client')).toBeInTheDocument();
  });

  it('RulesEditor — remove rule — drops the row', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[showRule]} />);
    await user.click(screen.getByRole('button', { name: /remove rule 1/i }));
    expect(screen.getByText(/no rules/i)).toBeInTheDocument();
  });

  it('RulesEditor — no axe violations with a rule', async () => {
    const { container } = render(<Harness initial={[showRule]} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

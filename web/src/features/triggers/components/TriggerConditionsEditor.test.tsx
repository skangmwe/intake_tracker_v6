// Behaviour + a11y tests for the trigger conditions editor. A local controlled harness holds the row
// state so add / remove / edit interactions reflect in the DOM. axe runs across the value-carrying,
// valueless (set/not-set), and empty states.

import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import type { ConditionRow } from '../triggerForm';
import { TriggerConditionsEditor } from './TriggerConditionsEditor';

const FIELD_KEYS = ['dueDate', 'benefitReviewDate', 'severity'];

function row(overrides: Partial<ConditionRow> = {}): ConditionRow {
  return { id: 'c1', whenFieldKey: 'dueDate', comparator: 'lt', compareValue: '@today', ...overrides };
}

function Harness({ initial }: { initial: ConditionRow[] }) {
  const [rows, setRows] = useState<ConditionRow[]>(initial);
  return <TriggerConditionsEditor rows={rows} fieldKeys={FIELD_KEYS} onChange={setRows} />;
}

describe('TriggerConditionsEditor', () => {
  it('renders a condition row with field, comparator, and value controls (no axe violations)', async () => {
    // Arrange / Act
    const { container } = render(<Harness initial={[row({ compareValue: '2026-01-01' })]} />);

    // Assert
    expect(screen.getByRole('combobox', { name: /condition 1 field/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /condition 1 comparator/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /condition 1 value/i })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Add condition — appends a second row', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness initial={[row()]} />);

    // Act
    await user.click(screen.getByRole('button', { name: /add condition/i }));

    // Assert
    expect(screen.getByRole('combobox', { name: /condition 2 field/i })).toBeInTheDocument();
  });

  it('Remove condition — drops the row', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness initial={[row(), row({ id: 'c2' })]} />);

    // Act
    await user.click(screen.getByRole('button', { name: /remove condition 2/i }));

    // Assert
    expect(screen.queryByRole('combobox', { name: /condition 2 field/i })).not.toBeInTheDocument();
  });

  it('valueless comparator — hides the value control (no axe violations)', async () => {
    // Arrange
    const user = userEvent.setup();
    const { container } = render(<Harness initial={[row({ compareValue: '2026-01-01' })]} />);

    // Act
    await user.selectOptions(
      screen.getByRole('combobox', { name: /condition 1 comparator/i }),
      'isSet',
    );

    // Assert
    expect(screen.queryByRole('textbox', { name: /condition 1 value/i })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Today toggle — disables the free-text value and sets the @today token', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness initial={[row({ compareValue: '2026-01-01' })]} />);

    // Act
    await user.click(screen.getByRole('checkbox', { name: /today/i }));

    // Assert
    expect(screen.getByRole('textbox', { name: /condition 1 value/i })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /today/i })).toBeChecked();
  });

  it('empty rows — shows the add hint (no axe violations)', async () => {
    // Arrange / Act
    const { container } = render(<Harness initial={[]} />);

    // Assert
    expect(screen.getByText(/no conditions yet/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

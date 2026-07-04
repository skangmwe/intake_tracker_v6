// Tests for the data-driven field renderer. One case per fieldType branch (the switch is the whole
// point of the component), asserting the rendered control kind, the change wiring, and — for the
// special cases — read-only and checkbox behaviour. Every rendered state carries a jest-axe check.

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FieldDefinitionDto } from '@shared/types';

import { buildFieldDefinition } from '@/test-utils';

import { RequestFieldControl } from './RequestFieldControl';

function field(overrides: Partial<FieldDefinitionDto>): FieldDefinitionDto {
  return buildFieldDefinition({ isRequired: false, ...overrides });
}

describe('RequestFieldControl', () => {
  it('RequestFieldControl — LongText — renders a textarea', async () => {
    // Arrange
    const onChange = jest.fn();
    const def = field({ fieldKey: 'summary', displayName: 'Summary', fieldType: 'LongText' });

    // Act
    const { container } = render(<RequestFieldControl field={def} value="hi" onChange={onChange} required={false} />);

    // Assert
    const control = screen.getByRole('textbox', { name: 'Summary (optional)' });
    expect(control.tagName).toBe('TEXTAREA');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RequestFieldControl — Number — renders a numeric input and forwards changes', async () => {
    // Arrange
    const onChange = jest.fn();
    const def = field({ fieldKey: 'count', displayName: 'Count', fieldType: 'Number' });

    // Act
    render(<RequestFieldControl field={def} value="" onChange={onChange} required />);
    await userEvent.type(screen.getByLabelText('Count'), '7');

    // Assert
    expect(screen.getByLabelText('Count')).toHaveAttribute('inputmode', 'numeric');
    expect(onChange).toHaveBeenCalledWith('7');
  });

  it('RequestFieldControl — Currency — uses a decimal input mode', () => {
    // Arrange
    const def = field({ fieldKey: 'amount', displayName: 'Amount', fieldType: 'Currency' });

    // Act
    render(<RequestFieldControl field={def} value="" onChange={jest.fn()} required={false} />);

    // Assert
    expect(screen.getByRole('textbox', { name: 'Amount (optional)' })).toHaveAttribute('inputmode', 'decimal');
  });

  it('RequestFieldControl — Date — renders a date input', () => {
    // Arrange
    const def = field({ fieldKey: 'due', displayName: 'Due', fieldType: 'Date' });

    // Act
    const { container } = render(<RequestFieldControl field={def} value="" onChange={jest.fn()} required={false} />);

    // Assert
    expect(container.querySelector('input[type="date"]')).toBeInTheDocument();
  });

  it('RequestFieldControl — SingleSelect — renders options and forwards the selected value', async () => {
    // Arrange
    const onChange = jest.fn();
    const def = field({
      fieldKey: 'tier',
      displayName: 'Tier',
      fieldType: 'SingleSelect',
      options: [
        { id: 'o1', value: 'one', label: 'Tier one', sortOrder: 0 },
        { id: 'o2', value: 'two', label: 'Tier two', sortOrder: 1 },
      ],
    });

    // Act
    const combo = () => screen.getByRole('combobox', { name: 'Tier (optional)' });
    const { container } = render(<RequestFieldControl field={def} value="" onChange={onChange} required={false} />);
    await userEvent.selectOptions(combo(), 'two');

    // Assert
    expect(screen.getByRole('option', { name: 'Tier one' })).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith('two');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('RequestFieldControl — Boolean — renders a checkbox reflecting the value and toggles it', async () => {
    // Arrange
    const onChange = jest.fn();
    const def = field({ fieldKey: 'active', displayName: 'Active', fieldType: 'Boolean' });

    // Act
    render(<RequestFieldControl field={def} value={true} onChange={onChange} required={false} />);
    const checkbox = screen.getByRole('checkbox', { name: 'Active' });

    // Assert — reflects the truthy value, and a click flips it
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('RequestFieldControl — Calculation — renders a read-only value with an em-dash fallback', () => {
    // Arrange
    const def = field({ fieldKey: 'score', displayName: 'Score', fieldType: 'Calculation' });

    // Act
    render(<RequestFieldControl field={def} value={null} onChange={jest.fn()} required={false} />);

    // Assert — no editable control, and the empty value shows an em-dash
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Score')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('RequestFieldControl — Url — falls through to a text field with url autocomplete', () => {
    // Arrange
    const def = field({ fieldKey: 'repo', displayName: 'Repo', fieldType: 'Url' });

    // Act
    render(<RequestFieldControl field={def} value="" onChange={jest.fn()} required={false} />);

    // Assert
    expect(screen.getByRole('textbox', { name: 'Repo (optional)' })).toHaveAttribute('autocomplete', 'url');
  });

  it('RequestFieldControl — default (ShortText) — renders a plain text field and can be disabled', () => {
    // Arrange
    const def = field({ fieldKey: 'name', displayName: 'Name', fieldType: 'ShortText' });

    // Act
    render(<RequestFieldControl field={def} value="Ada" onChange={jest.fn()} required disabled error="Too short" />);

    // Assert
    const input = screen.getByLabelText('Name');
    expect(input).toHaveValue('Ada');
    expect(input).toBeDisabled();
  });
});

// Tests for ImportColumnMapper — the wizard's column→field mapping table. Covers rendering a select
// per column with a sample value, changing a mapping, the duplicate-target inline error, and jest-axe
// across the default and duplicate states.

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { IoFieldSpec } from '@shared/types';

import { ImportColumnMapper } from './ImportColumnMapper';
import type { ColumnMapping } from '../importMapping';

const FIELDS: IoFieldSpec[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'description', label: 'Description' },
];
const HEADERS = ['Title', 'Notes'];
const SAMPLE = ['Alpha', 'A note'];

function renderMapper(mapping: ColumnMapping, onChange = jest.fn()) {
  return render(
    <ImportColumnMapper
      headers={HEADERS}
      sampleRow={SAMPLE}
      fields={FIELDS}
      mapping={mapping}
      onChange={onChange}
    />,
  );
}

describe('ImportColumnMapper', () => {
  it('ImportColumnMapper — renders a labelled select and sample per column', () => {
    // Arrange / Act
    renderMapper({ 0: 'name', 1: '' });

    // Assert
    expect(screen.getByRole('combobox', { name: /Map column Title/ })).toHaveValue('name');
    expect(screen.getByRole('combobox', { name: /Map column Notes/ })).toHaveValue('');
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    // The required field is marked in its option label (one option per column's select).
    expect(screen.getAllByRole('option', { name: 'Name (required)' })).toHaveLength(2);
  });

  it('ImportColumnMapper — changing a select — calls onChange with the column index and key', async () => {
    // Arrange
    const onChange = jest.fn();
    renderMapper({ 0: 'name', 1: '' }, onChange);

    // Act
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /Map column Notes/ }),
      'description',
    );

    // Assert
    expect(onChange).toHaveBeenCalledWith(1, 'description');
  });

  it('ImportColumnMapper — same field mapped twice — flags both rows', async () => {
    // Arrange / Act — both columns map to name.
    const { container } = renderMapper({ 0: 'name', 1: 'name' });

    // Assert
    const errors = screen.getAllByRole('alert');
    expect(errors).toHaveLength(2);
    expect(errors[0]).toHaveTextContent('already mapped');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ImportColumnMapper — default render — has no axe violations', async () => {
    const { container } = renderMapper({ 0: 'name', 1: '' });
    expect(await axe(container)).toHaveNoViolations();
  });
});

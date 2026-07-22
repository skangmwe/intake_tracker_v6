// Tests for ExportFieldPicker — the export wizard's column checklist. Covers the locked identity
// checkbox (checked + disabled), toggling an optional field, and jest-axe on the rendered fieldset.

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { IoFieldSpec } from '@shared/types';

import { ExportFieldPicker } from './ExportFieldPicker';

const FIELDS: IoFieldSpec[] = [
  { key: 'id', label: 'Record ID', alwaysIncluded: true },
  { key: 'name', label: 'Name' },
  { key: 'stage', label: 'Stage' },
];

describe('ExportFieldPicker', () => {
  it('ExportFieldPicker — always-included field — is checked and disabled', () => {
    // Arrange / Act
    render(<ExportFieldPicker fields={FIELDS} selected={new Set()} onToggle={jest.fn()} />);

    // Assert
    const identity = screen.getByRole('checkbox', { name: /Record ID/ });
    expect(identity).toBeChecked();
    expect(identity).toBeDisabled();
    expect(screen.getByText('(always included)')).toBeInTheDocument();
  });

  it('ExportFieldPicker — toggling an optional field — calls onToggle with its key', async () => {
    // Arrange
    const onToggle = jest.fn();
    render(<ExportFieldPicker fields={FIELDS} selected={new Set(['name'])} onToggle={onToggle} />);

    // Act
    await userEvent.click(screen.getByRole('checkbox', { name: 'Stage' }));

    // Assert
    expect(onToggle).toHaveBeenCalledWith('stage');
    expect(screen.getByRole('checkbox', { name: 'Name' })).toBeChecked();
  });

  it('ExportFieldPicker — default render — has no axe violations', async () => {
    const { container } = render(
      <ExportFieldPicker fields={FIELDS} selected={new Set(['name'])} onToggle={jest.fn()} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

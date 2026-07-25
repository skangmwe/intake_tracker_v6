import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { buildFieldDefinition } from '@/test-utils';

import { FieldEditorFooter } from './FieldEditorFooter';

const baseProps: React.ComponentProps<typeof FieldEditorFooter> = {
  readOnly: false,
  field: null,
  isArchiving: false,
  isSaving: false,
  onClose: () => {},
};

function renderFooter(overrides: Partial<React.ComponentProps<typeof FieldEditorFooter>> = {}) {
  return render(<FieldEditorFooter {...baseProps} {...overrides} />);
}

describe('FieldEditorFooter', () => {
  it('FieldEditorFooter — readOnly — renders only Close, no Save field', () => {
    // Arrange / Act
    renderFooter({ readOnly: true });

    // Assert
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save field/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /archive/i })).not.toBeInTheDocument();
  });

  it('FieldEditorFooter — editable — renders Cancel and Save field', () => {
    // Arrange / Act
    renderFooter();

    // Assert
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save field' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('FieldEditorFooter — editable, non-retired field with onArchive — offers Archive', () => {
    // Arrange / Act
    renderFooter({
      field: buildFieldDefinition({ isRetired: false }),
      onArchive: () => {},
    });

    // Assert
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });

  it('FieldEditorFooter — no axe violations (readOnly and editable)', async () => {
    // Arrange
    const { container, rerender } = render(<FieldEditorFooter {...baseProps} readOnly />);
    // Act / Assert
    expect(await axe(container)).toHaveNoViolations();

    rerender(<FieldEditorFooter {...baseProps} readOnly={false} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

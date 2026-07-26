import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { buildObjectDefinition } from '@/test-utils';

import { PlatformObjectEditorSheet } from './PlatformObjectEditorSheet';

function renderSheet(
  overrides: Partial<React.ComponentProps<typeof PlatformObjectEditorSheet>> = {},
) {
  const props: React.ComponentProps<typeof PlatformObjectEditorSheet> = {
    object: null,
    saveError: null,
    isSaving: false,
    isDeleting: false,
    onSave: jest.fn(),
    onDelete: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<PlatformObjectEditorSheet {...props} />) };
}

describe('PlatformObjectEditorSheet', () => {
  it('PlatformObjectEditorSheet — create mode — no Delete, Save disabled until named, no a11y violations', async () => {
    // Arrange
    const { container } = renderSheet();

    // Assert
    expect(screen.getByRole('dialog', { name: 'New global object' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save object' })).toBeDisabled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformObjectEditorSheet — save — emits the trimmed form value', async () => {
    // Arrange
    const onSave = jest.fn();
    const user = userEvent.setup();
    renderSheet({ onSave });

    // Act
    await user.type(screen.getByLabelText('Display name'), '  Matter  ');
    await user.click(screen.getByRole('button', { name: 'Save object' }));

    // Assert — the name is trimmed before it leaves the sheet.
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Matter' }));
  });

  it('PlatformObjectEditorSheet — edit mode — seeds the object and Delete calls onDelete with its id', async () => {
    // Arrange
    const onDelete = jest.fn();
    const user = userEvent.setup();
    const vendor = buildObjectDefinition({
      id: 'vendor',
      name: 'Vendor',
      location: 'Global',
      isSystem: false,
    });
    renderSheet({ object: vendor, onDelete });

    // Assert + Act
    expect(screen.getByRole('dialog', { name: 'Edit Vendor' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Vendor')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith('vendor');
  });

  it('PlatformObjectEditorSheet — Escape closes', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    renderSheet({ onClose });
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

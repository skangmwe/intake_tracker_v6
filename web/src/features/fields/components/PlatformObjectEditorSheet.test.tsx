import { render, screen, within } from '@testing-library/react';
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

  it('PlatformObjectEditorSheet — edit mode — seeds the object; delete confirms inline then calls onDelete', async () => {
    // Arrange
    const onDelete = jest.fn();
    const user = userEvent.setup();
    const vendor = buildObjectDefinition({
      id: 'vendor',
      name: 'Vendor',
      location: 'Global',
      isSystem: false,
    });
    const { container } = renderSheet({ object: vendor, onDelete });

    // Assert — edit mode is a meaningfully different rendered state (Delete present) → axe it.
    expect(screen.getByRole('dialog', { name: 'Edit Vendor' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Vendor')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    // Act — a raw Delete click confirms inline first; it must NOT delete immediately.
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).not.toHaveBeenCalled();
    const confirm = screen.getByRole('alertdialog');
    expect(confirm).toHaveTextContent(/removed from every workspace/i);
    expect(await axe(container)).toHaveNoViolations();

    // Confirming actually deletes.
    await user.click(screen.getByRole('button', { name: 'Delete object' }));
    expect(onDelete).toHaveBeenCalledWith('vendor');
  });

  it('PlatformObjectEditorSheet — delete confirm — Cancel dismisses without deleting', async () => {
    const onDelete = jest.fn();
    const user = userEvent.setup();
    renderSheet({
      object: buildObjectDefinition({ id: 'vendor', name: 'Vendor', location: 'Global', isSystem: false }),
      onDelete,
    });

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const confirm = screen.getByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('PlatformObjectEditorSheet — Escape closes', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    renderSheet({ onClose });
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

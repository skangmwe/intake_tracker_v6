// ObjectEditorSheet — create / edit-custom / view-built-in modes. Covers the disabled-until-named
// Save, the built-in read-only lock (no Save, no Delete), the edit-mode Records/Fields meta, the
// conditional Sidebar category, and an axe check on each meaningfully different state.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { buildObjectDefinition } from '@/test-utils';

import { ObjectEditorSheet } from './ObjectEditorSheet';

function renderSheet(overrides: Partial<React.ComponentProps<typeof ObjectEditorSheet>> = {}) {
  const props: React.ComponentProps<typeof ObjectEditorSheet> = {
    object: null,
    existingCategories: [],
    saveError: null,
    isSaving: false,
    isDeleting: false,
    onSave: jest.fn(),
    onDelete: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<ObjectEditorSheet {...props} />) };
}

describe('ObjectEditorSheet', () => {
  it('ObjectEditorSheet — create mode — shows the new-object dialog with Save disabled until named', async () => {
    // Arrange
    const user = userEvent.setup();
    renderSheet();

    // Assert — dialog + Save disabled while the name is blank.
    expect(screen.getByRole('dialog', { name: 'New object' })).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save object' });
    expect(save).toBeDisabled();

    // Act — typing a name enables Save.
    await user.type(screen.getByLabelText('Display name'), 'Vendor');

    // Assert
    expect(save).toBeEnabled();
  });

  it('ObjectEditorSheet — submit — emits the trimmed form value', async () => {
    // Arrange
    const onSave = jest.fn();
    const user = userEvent.setup();
    renderSheet({ onSave });

    // Act
    await user.type(screen.getByLabelText('Display name'), '  Vendor  ');
    await user.click(screen.getByRole('button', { name: 'Save object' }));

    // Assert
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Vendor', location: 'LocalWorkspace' }),
    );
  });

  it('ObjectEditorSheet — edit custom object — pre-fills, shows meta, and offers Delete', () => {
    // Arrange / Act
    renderSheet({
      object: buildObjectDefinition({ name: 'Vendor', recordsCount: 3, fieldsCount: 1 }),
    });

    // Assert
    expect(screen.getByRole('dialog', { name: /edit vendor/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Vendor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    expect(screen.getByText('Records')).toBeInTheDocument();
    expect(screen.getByText('Fields')).toBeInTheDocument();
  });

  it('ObjectEditorSheet — built-in object — is read-only with no Save or Delete', () => {
    // Arrange / Act
    renderSheet({ object: buildObjectDefinition({ name: 'Request', isSystem: true }) });

    // Assert — the display name is disabled; there is a Close (not Cancel) and no Save / Delete.
    expect(screen.getByLabelText('Display name')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save object' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();

    // Assert — the read-only banner is present with the expected copy.
    const banner = screen.getByRole('note');
    expect(banner).toHaveTextContent('built-in object');
    expect(banner).toHaveTextContent('edited here');
  });

  it('ObjectEditorSheet — Global custom object — is read-only with a firm-wide lock and no Save/Delete', () => {
    // Arrange / Act — a Global custom object surfaces here with location Global, isSystem false,
    // workspaceId Guid.Empty (not owned by this workspace).
    renderSheet({
      object: buildObjectDefinition({
        name: 'Vendor',
        location: 'Global',
        isSystem: false,
        workspaceId: '00000000-0000-0000-0000-000000000000',
      }),
    });

    // Assert — the form is disabled; Close (not Cancel), no Save / Delete.
    expect(screen.getByLabelText('Display name')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save object' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();

    // Assert — the firm-wide lock banner (distinct from the built-in copy).
    const banner = screen.getByRole('note');
    expect(banner).toHaveTextContent('firm-wide object');
    expect(banner).toHaveTextContent('managed by a platform admin');
  });

  it('ObjectEditorSheet — Global custom read-only mode — no accessibility violations', async () => {
    // Arrange
    const { container } = renderSheet({
      object: buildObjectDefinition({ name: 'Vendor', location: 'Global', isSystem: false }),
    });

    // Act
    const results = await axe(container);

    // Assert
    expect(results).toHaveNoViolations();
  });

  it('ObjectEditorSheet — sidebar category — hides when Show in sidebar is off', async () => {
    // Arrange
    const user = userEvent.setup();
    renderSheet();

    // Assert — category select is visible while the switch is on (create defaults on).
    expect(screen.getByLabelText('Sidebar category')).toBeInTheDocument();

    // Act — turn the switch off.
    await user.click(screen.getByRole('checkbox', { name: 'Show in left sidebar' }));

    // Assert
    expect(screen.queryByLabelText('Sidebar category')).not.toBeInTheDocument();
  });

  it('ObjectEditorSheet — create mode — no accessibility violations', async () => {
    // Arrange
    const { container } = renderSheet();

    // Act
    const results = await axe(container);

    // Assert
    expect(results).toHaveNoViolations();
  });

  it('ObjectEditorSheet — built-in read-only mode — no accessibility violations', async () => {
    // Arrange
    const { container } = renderSheet({
      object: buildObjectDefinition({ name: 'Request', isSystem: true }),
    });

    // Act
    const results = await axe(container);

    // Assert
    expect(results).toHaveNoViolations();
  });
});

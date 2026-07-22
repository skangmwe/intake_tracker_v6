import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { buildPlatformField } from '@/test-utils';

import { PlatformFieldEditorSheet } from './PlatformFieldEditorSheet';

function renderSheet(
  overrides: Partial<React.ComponentProps<typeof PlatformFieldEditorSheet>> = {},
) {
  const props: React.ComponentProps<typeof PlatformFieldEditorSheet> = {
    field: buildPlatformField(),
    isSaving: false,
    saveError: null,
    onSave: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<PlatformFieldEditorSheet {...props} />) };
}

describe('PlatformFieldEditorSheet', () => {
  it('PlatformFieldEditorSheet — seeds the name and shows the key', () => {
    renderSheet();
    expect(screen.getByRole('dialog', { name: 'Legacy ID' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Legacy ID')).toBeInTheDocument();
    expect(screen.getByText('legacy-id')).toBeInTheDocument();
  });

  it('PlatformFieldEditorSheet — saving a renamed field passes the new name and null options', async () => {
    // Arrange
    const onSave = jest.fn();
    const user = userEvent.setup();
    renderSheet({ onSave });

    // Act
    const nameInput = screen.getByDisplayValue('Legacy ID');
    await user.clear(nameInput);
    await user.type(nameInput, 'Legacy Identifier');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    // Assert — a Text field carries no options.
    expect(onSave).toHaveBeenCalledWith('legacy-id', 'Legacy Identifier', null);
  });

  it('PlatformFieldEditorSheet — a Select field edits and submits its options', async () => {
    // Arrange
    const onSave = jest.fn();
    const user = userEvent.setup();
    renderSheet({
      field: buildPlatformField({
        fieldKey: 'ai-solutions-status',
        displayName: 'AI Solutions Status',
        fieldType: 'Select',
        selectOptions: ['Intake', 'Delivery'],
      }),
      onSave,
    });

    // Act
    const options = screen.getByDisplayValue('Intake, Delivery');
    await user.clear(options);
    await user.type(options, 'Intake, Triage, Delivery');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    // Assert
    expect(onSave).toHaveBeenCalledWith('ai-solutions-status', 'AI Solutions Status', [
      'Intake',
      'Triage',
      'Delivery',
    ]);
  });

  it('PlatformFieldEditorSheet — Escape closes', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    renderSheet({ onClose });
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('PlatformFieldEditorSheet — a save error is announced', async () => {
    const { container } = renderSheet({ saveError: 'This is a system field.' });
    expect(screen.getByRole('alert')).toHaveTextContent('This is a system field.');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformFieldEditorSheet — disables the actions while saving', () => {
    renderSheet({ isSaving: true });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('PlatformFieldEditorSheet — cannot save an empty name', async () => {
    const onSave = jest.fn();
    const user = userEvent.setup();
    renderSheet({ onSave });
    await user.clear(screen.getByDisplayValue('Legacy ID'));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('PlatformFieldEditorSheet — no axe violations in the default state', async () => {
    const { container } = renderSheet();
    expect(await axe(container)).toHaveNoViolations();
  });
});

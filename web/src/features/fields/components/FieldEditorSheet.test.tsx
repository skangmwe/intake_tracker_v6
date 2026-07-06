import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { buildFieldDefinition } from '@/test-utils';

import { FIELD_TYPE_OPTIONS } from '../constants';
import { FieldEditorSheet } from './FieldEditorSheet';

function renderSheet(overrides: Partial<React.ComponentProps<typeof FieldEditorSheet>> = {}) {
  const props: React.ComponentProps<typeof FieldEditorSheet> = {
    objectType: 'Request',
    field: null,
    fieldTypeOptions: FIELD_TYPE_OPTIONS,
    availableFieldKeys: ['deptPgClient'],
    saveError: null,
    isSaving: false,
    onSave: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<FieldEditorSheet {...props} />) };
}

describe('FieldEditorSheet', () => {
  it('FieldEditorSheet — create mode — shows the add-field dialog', () => {
    renderSheet();
    expect(screen.getByRole('dialog', { name: 'Add field' })).toBeInTheDocument();
  });

  it('FieldEditorSheet — edit mode — pre-fills the field and locks the key', () => {
    renderSheet({ field: buildFieldDefinition({ displayName: 'Due Date', fieldKey: 'dueDate' }) });
    expect(screen.getByRole('dialog', { name: /edit due date/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('dueDate')).toBeDisabled();
  });

  it('FieldEditorSheet — submit — builds a create request from the form', async () => {
    // Arrange
    const onSave = jest.fn();
    const user = userEvent.setup();
    renderSheet({ onSave });

    // Act
    await user.type(screen.getByLabelText('Display name'), 'Severity');
    await user.type(screen.getByLabelText('Field key'), 'severity');
    await user.click(screen.getByRole('button', { name: 'Save field' }));

    // Assert
    expect(onSave).toHaveBeenCalledWith(
      'severity',
      expect.objectContaining({ fieldKey: 'severity', displayName: 'Severity', objectType: 'Request' }),
      true,
    );
  });

  it('FieldEditorSheet — Escape — closes the sheet', async () => {
    // Arrange
    const onClose = jest.fn();
    const user = userEvent.setup();
    renderSheet({ onClose });

    // Act
    await user.keyboard('{Escape}');

    // Assert
    expect(onClose).toHaveBeenCalled();
  });

  it('FieldEditorSheet — save error — announces it', () => {
    renderSheet({ saveError: 'A field rule chain is too deep.' });
    expect(screen.getByRole('alert')).toHaveTextContent('A field rule chain is too deep.');
  });

  it('FieldEditorSheet — numeric type — reveals min/max and submits them', async () => {
    // Arrange
    const onSave = jest.fn();
    const user = userEvent.setup();
    renderSheet({ onSave });

    // Act — switch the type to Number, fill the field, set bounds, save.
    await user.type(screen.getByLabelText('Display name'), 'Business Value');
    await user.type(screen.getByLabelText('Field key'), 'businessValue');
    await user.selectOptions(screen.getByLabelText('Type'), 'Number');
    await user.type(screen.getByLabelText('Min value'), '1');
    await user.type(screen.getByLabelText('Max value'), '5');
    await user.click(screen.getByRole('button', { name: 'Save field' }));

    // Assert
    expect(onSave).toHaveBeenCalledWith('businessValue', expect.objectContaining({ minValue: 1, maxValue: 5 }), true);
  }, 15000);

  it('FieldEditorSheet — select type — captures options', async () => {
    // Arrange
    const onSave = jest.fn();
    const user = userEvent.setup();
    renderSheet({ onSave });

    // Act
    await user.type(screen.getByLabelText('Display name'), 'Timing');
    await user.type(screen.getByLabelText('Field key'), 'timing');
    await user.selectOptions(screen.getByLabelText('Type'), 'SingleSelect');
    await user.click(screen.getByRole('button', { name: /add option/i }));
    await user.type(screen.getByPlaceholderText('Value'), 'Urgent');
    await user.click(screen.getByRole('button', { name: 'Save field' }));

    // Assert
    expect(onSave).toHaveBeenCalledWith(
      'timing',
      expect.objectContaining({ options: [{ value: 'Urgent', label: 'Urgent', sortOrder: 0 }] }),
      true,
    );
  });

  it('FieldEditorSheet — calculation type — captures the expression', async () => {
    // Arrange
    const onSave = jest.fn();
    const user = userEvent.setup();
    renderSheet({ onSave });

    // Act
    await user.type(screen.getByLabelText('Display name'), 'Priority Score');
    await user.type(screen.getByLabelText('Field key'), 'priorityScore');
    await user.selectOptions(screen.getByLabelText('Type'), 'Calculation');
    await user.type(screen.getByLabelText('Expression'), 'a + b');
    await user.click(screen.getByRole('button', { name: 'Save field' }));

    // Assert
    expect(onSave).toHaveBeenCalledWith(
      'priorityScore',
      expect.objectContaining({ derived: { kind: 'Calculation', expression: 'a + b', defaultValue: null } }),
      true,
    );
  });

  it('FieldEditorSheet — stage toggle + rule add — included in the request', async () => {
    // Arrange
    const onSave = jest.fn();
    const user = userEvent.setup();
    renderSheet({ onSave, availableFieldKeys: ['deptPgClient'] });

    // Act
    await user.type(screen.getByLabelText('Display name'), 'Client number');
    await user.type(screen.getByLabelText('Field key'), 'clientNumber');
    await user.click(screen.getByLabelText('build'));
    await user.click(screen.getByRole('button', { name: /add rule/i }));
    await user.click(screen.getByRole('button', { name: 'Save field' }));

    // Assert
    const [, request] = onSave.mock.calls[0]!;
    expect(request.visibleStages).toContain('build');
    expect(request.rules).toHaveLength(1);
  });

  it('FieldEditorSheet — DerivedCategory type — reveals the default value input', async () => {
    // Arrange
    const user = userEvent.setup();
    renderSheet();

    // Act
    await user.selectOptions(screen.getByLabelText('Type'), 'DerivedCategory');

    // Assert
    expect(screen.getByLabelText(/default value/i)).toBeInTheDocument();
  });

  it('FieldEditorSheet — no axe violations (create and error states)', async () => {
    const { container, rerender } = renderSheet();
    expect(await axe(container)).toHaveNoViolations();

    rerender(
      <FieldEditorSheet
        objectType="Request"
        field={buildFieldDefinition({ fieldType: 'SingleSelect', options: [{ id: 'o', value: 'A', label: 'A', sortOrder: 0 }] })}
        fieldTypeOptions={FIELD_TYPE_OPTIONS}
        availableFieldKeys={['deptPgClient']}
        saveError="Something went wrong."
        isSaving={false}
        onSave={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

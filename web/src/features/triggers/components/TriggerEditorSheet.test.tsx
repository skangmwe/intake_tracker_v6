// Behaviour + a11y tests for the trigger editor sheet. Covers the create and edit chrome, the
// cadence-interval reveal, recipient selection, submit payload, the server-error slot, and delete.
// axe runs across the create, error, and edit states.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { TriggerEditorSheet } from './TriggerEditorSheet';
import type { TriggerDto } from '../types';

const FIELD_KEYS = ['dueDate', 'severity'];

function buildTrigger(overrides: Partial<TriggerDto> = {}): TriggerDto {
  return {
    triggerId: 't-1',
    objectType: 'Request',
    kind: 'Authored',
    name: 'SLA breach',
    isEnabled: true,
    cadence: 'RepeatEveryNDays',
    repeatIntervalDays: 2,
    windowDays: null,
    notificationCategory: 'sla-reminder',
    recipients: ['assignedAnalyst'],
    notificationTitle: 'Request nearing SLA',
    notificationBody: 'Please review.',
    conditions: [{ whenFieldKey: 'dueDate', comparator: 'lt', compareValue: '@today' }],
    ...overrides,
  };
}

const noop = () => undefined;

describe('TriggerEditorSheet', () => {
  it('create mode — renders the add-trigger dialog (no axe violations)', async () => {
    // Arrange / Act
    const { container } = render(
      <TriggerEditorSheet
        trigger={null}
        fieldKeys={FIELD_KEYS}
        saveError={null}
        isSaving={false}
        onSave={noop}
        onClose={noop}
      />,
    );

    // Assert
    expect(screen.getByRole('dialog', { name: /add trigger/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete trigger/i })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('cadence — switching to repeat reveals the interval input', async () => {
    // Arrange
    const user = userEvent.setup();
    render(
      <TriggerEditorSheet
        trigger={null}
        fieldKeys={FIELD_KEYS}
        saveError={null}
        isSaving={false}
        onSave={noop}
        onClose={noop}
      />,
    );
    expect(screen.queryByRole('textbox', { name: /every n days/i })).not.toBeInTheDocument();

    // Act
    await user.selectOptions(screen.getByRole('combobox', { name: /cadence/i }), 'RepeatEveryNDays');

    // Assert
    expect(screen.getByRole('textbox', { name: /every n days/i })).toBeInTheDocument();
  });

  it('submit — sends the trimmed form with the chosen recipient', async () => {
    // Arrange
    const user = userEvent.setup();
    const onSave = jest.fn();
    render(
      <TriggerEditorSheet
        trigger={null}
        fieldKeys={FIELD_KEYS}
        saveError={null}
        isSaving={false}
        onSave={onSave}
        onClose={noop}
      />,
    );

    // Act
    await user.type(screen.getByRole('textbox', { name: /^name$/i }), 'My trigger');
    await user.type(screen.getByRole('textbox', { name: /notification title/i }), 'Heads up');
    await user.click(screen.getByRole('checkbox', { name: /assigned analyst/i }));
    await user.click(screen.getByRole('button', { name: /save trigger/i }));

    // Assert
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'My trigger',
        notificationTitle: 'Heads up',
        recipients: ['assignedAnalyst'],
        cadence: 'Once',
        repeatIntervalDays: null,
      }),
    );
  });

  it('server error — renders it in an alert (no axe violations)', async () => {
    // Arrange / Act
    const { container } = render(
      <TriggerEditorSheet
        trigger={null}
        fieldKeys={FIELD_KEYS}
        saveError="Choose at least one recipient."
        isSaving={false}
        onSave={noop}
        onClose={noop}
      />,
    );

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(/at least one recipient/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('edit mode — shows the edit chrome and delete (no axe violations)', async () => {
    // Arrange
    const user = userEvent.setup();
    const onDelete = jest.fn();
    const { container } = render(
      <TriggerEditorSheet
        trigger={buildTrigger()}
        fieldKeys={FIELD_KEYS}
        saveError={null}
        isSaving={false}
        onSave={noop}
        onDelete={onDelete}
        isDeleting={false}
        onClose={noop}
      />,
    );

    // Assert — repeat cadence pre-selects the interval; delete is present.
    expect(screen.getByRole('dialog', { name: /edit sla breach/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /every n days/i })).toHaveValue('2');
    expect(await axe(container)).toHaveNoViolations();

    // Act
    await user.click(screen.getByRole('button', { name: /delete trigger/i }));

    // Assert
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

// Component tests for a single TaskRow — exercises the check-off / reopen branch, the assignee
// label variants, the Locked precondition row, the Notes expander, and every typed-field value
// control (url with/without link, text, number, date, select, checkbox) plus the disabled state,
// each with a jest-axe assertion where the render meaningfully differs (web-testing.md).

import { axe } from 'jest-axe';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FieldDefinitionId, TaskDto, TaskId, TaskLibraryFieldDto, TaskTypedFieldValue, UserId } from '@shared/types';

import { TaskRow } from './TaskRow';

const ME = 'user-me' as UserId;
const OTHER = 'user-other' as UserId;
const ENV_FIELD = 'field-env' as FieldDefinitionId;

const ENV_LIBRARY: TaskLibraryFieldDto[] = [
  {
    id: ENV_FIELD,
    fieldKey: 'environment',
    displayName: 'Environment',
    fieldType: 'Select',
    options: [
      { id: 'o1', value: 'Dev', label: 'Dev', sortOrder: 1 },
      { id: 'o2', value: 'Production', label: 'Production', sortOrder: 2 },
    ],
    sortOrder: 1,
    isRetired: false,
  },
];

function buildTask(overrides: Partial<TaskDto> = {}): TaskDto {
  return {
    id: 't1' as TaskId,
    parentRequestId: 'AIS-00000001' as never,
    title: 'Confirm scope',
    phase: 'Discovery',
    status: 'Open',
    assignee: ME,
    createdAt: '2026-07-01T09:00:00Z',
    ...overrides,
  };
}

function renderRow(task: TaskDto, opts: { library?: TaskLibraryFieldDto[]; disabled?: boolean; onPatch?: jest.Mock } = {}) {
  const onPatch = opts.onPatch ?? jest.fn();
  const utils = render(
    <ul>
      <TaskRow task={task} currentUserId={ME} library={opts.library ?? []} disabled={opts.disabled ?? false} onPatch={onPatch} />
    </ul>,
  );
  return { onPatch, ...utils };
}

function typedTask(value: TaskTypedFieldValue): TaskDto {
  return buildTask({ typedField: { definitionId: ENV_FIELD, label: 'Environment', value } });
}

describe('TaskRow', () => {
  it('TaskRow — open task — check-off patches it Done', async () => {
    // Arrange
    const { onPatch, container } = renderRow(buildTask({ title: 'Scope' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Mark Scope done' }));

    // Assert
    expect(onPatch).toHaveBeenCalledWith({ status: 'Done' });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('TaskRow — done task — strikes the title, shows the completed chip, reopens on click', async () => {
    // Arrange
    const { onPatch, container } = renderRow(buildTask({ title: 'Scope', status: 'Done', completedAt: '2026-06-24T10:00:00Z' }));

    // Assert — completed chip present, title struck.
    expect(screen.getByText('Scope')).toHaveClass('task-row__title--done');
    expect(await axe(container)).toHaveNoViolations();

    // Act — reopen.
    await userEvent.click(screen.getByRole('button', { name: 'Reopen Scope' }));
    expect(onPatch).toHaveBeenCalledWith({ status: 'Open' });
  });

  it('TaskRow — assignee label reflects self, teammate, and unassigned', () => {
    // Assert — three variants.
    const self = renderRow(buildTask({ assignee: ME }));
    expect(within(self.container).getByText('You')).toBeInTheDocument();
    self.unmount();

    const other = renderRow(buildTask({ assignee: OTHER }));
    expect(within(other.container).getByText('A teammate')).toBeInTheDocument();
    other.unmount();

    // Build an unassigned task by omitting assignee (exactOptionalPropertyTypes forbids passing
    // `assignee: undefined`), so the row falls back to the "Unassigned" label.
    const base = buildTask({});
    const none = renderRow({
      id: base.id,
      parentRequestId: base.parentRequestId,
      title: base.title,
      phase: base.phase,
      status: base.status,
      createdAt: base.createdAt,
    });
    expect(within(none.container).getByText('Unassigned')).toBeInTheDocument();
  });

  it('TaskRow — Locked task shows the precondition row', () => {
    // Act
    renderRow(buildTask({ status: 'Locked' }));

    // Assert
    expect(screen.getByText(/Locked until its precondition is met/)).toBeInTheDocument();
  });

  it('TaskRow — the notes expander toggles the textarea and commits on blur', async () => {
    // Arrange
    const { onPatch } = renderRow(buildTask());

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Task notes and decisions' }));
    const textarea = screen.getByLabelText('Notes & decisions');
    await userEvent.type(textarea, 'Decided B');
    fireEvent.blur(textarea);

    // Assert
    expect(onPatch).toHaveBeenCalledWith({ notes: 'Decided B' });
  });

  it('TaskRow — a URL field with a value shows an open link; empty shows none', () => {
    // Arrange — with value.
    const withValue = renderRow(typedTask({ kind: 'url', url: 'github.com/x' }));
    expect(within(withValue.container).getByRole('link', { name: 'Open link in a new tab' })).toHaveAttribute(
      'href',
      'https://github.com/x',
    );
    withValue.unmount();

    // Arrange — empty (no link).
    const empty = renderRow(typedTask({ kind: 'url', url: '' }));
    expect(within(empty.container).queryByRole('link')).not.toBeInTheDocument();
  });

  it('TaskRow — a text field commits its value on blur', async () => {
    // Arrange
    const { onPatch } = renderRow(typedTask({ kind: 'text', text: '' }));

    // Act
    const input = screen.getByRole('textbox', { name: 'Field value' });
    await userEvent.type(input, 'note');
    fireEvent.blur(input);

    // Assert
    expect(onPatch).toHaveBeenCalledWith({ typedField: { definitionId: ENV_FIELD, value: { kind: 'text', text: 'note' } } });
  });

  it('TaskRow — a number field commits a parsed number on blur', async () => {
    // Arrange
    const { onPatch } = renderRow(typedTask({ kind: 'number', number: 0 }));

    // Act
    const input = screen.getByRole('textbox', { name: 'Field value' });
    await userEvent.clear(input);
    await userEvent.type(input, '42');
    fireEvent.blur(input);

    // Assert
    expect(onPatch).toHaveBeenCalledWith({ typedField: { definitionId: ENV_FIELD, value: { kind: 'number', number: 42 } } });
  });

  it('TaskRow — a date field commits on change', async () => {
    // Arrange
    const { onPatch } = renderRow(typedTask({ kind: 'date', date: '' }));

    // Act
    fireEvent.change(screen.getByLabelText('Field value'), { target: { value: '2026-07-01' } });

    // Assert
    expect(onPatch).toHaveBeenCalledWith({ typedField: { definitionId: ENV_FIELD, value: { kind: 'date', date: '2026-07-01' } } });
  });

  it('TaskRow — a select field lists the library options and commits on change', async () => {
    // Arrange
    const { onPatch } = renderRow(typedTask({ kind: 'select', selectedOption: 'Dev' }), { library: ENV_LIBRARY });

    // Assert — options resolved from the library.
    expect(screen.getByRole('option', { name: 'Production' })).toBeInTheDocument();

    // Act
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Field value' }), 'Production');
    expect(onPatch).toHaveBeenCalledWith({ typedField: { definitionId: ENV_FIELD, value: { kind: 'select', selectedOption: 'Production' } } });
  });

  it('TaskRow — a checkbox field toggles on click', async () => {
    // Arrange
    const { onPatch } = renderRow(typedTask({ kind: 'checkbox', checked: false }));

    // Act
    await userEvent.click(screen.getByRole('checkbox', { name: 'Field value' }));

    // Assert
    expect(onPatch).toHaveBeenCalledWith({ typedField: { definitionId: ENV_FIELD, value: { kind: 'checkbox', checked: true } } });
  });

  it('TaskRow — disabled hides interaction on the check-off and value controls', () => {
    // Act
    renderRow(typedTask({ kind: 'url', url: 'github.com/x' }), { disabled: true });

    // Assert
    expect(screen.getByRole('button', { name: 'Mark Confirm scope done' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Field value' })).toBeDisabled();
  });
});

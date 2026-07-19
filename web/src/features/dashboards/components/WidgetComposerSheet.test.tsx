// Tests for the widget composer sheet (slice 28): the type-driven conditional control (metric vs
// group-by vs rows), title-required validation, the saved draft, dept-scope selection, and a11y
// across two type states.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import { emptyWidgetDraft } from '../composerModel';
import type { ComposerScopeOptions } from '../useComposerScopeOptions';
import { WidgetComposerSheet } from './WidgetComposerSheet';

expect.extend(toHaveNoViolations);

const SCOPE: ComposerScopeOptions = {
  deptOptions: ['Dept', 'PG'],
  stageOptions: [{ key: 'build', label: 'Build' }],
  stageLabels: { build: 'Build' },
  isLoading: false,
};

function setup(overrides: Partial<Parameters<typeof WidgetComposerSheet>[0]> = {}) {
  const onSave = jest.fn();
  const onClose = jest.fn();
  const utils = render(
    <WidgetComposerSheet
      mode="new"
      initialDraft={emptyWidgetDraft()}
      scope={SCOPE}
      onSave={onSave}
      onClose={onClose}
      isPending={false}
      {...overrides}
    />,
  );
  return { onSave, onClose, ...utils };
}

it('WidgetComposerSheet — KPI type shows Metric; switching to breakdown shows Group by', async () => {
  // Arrange
  setup();
  expect(screen.getByLabelText('Metric')).toBeInTheDocument();
  expect(screen.queryByLabelText('Group by')).not.toBeInTheDocument();

  // Act
  await userEvent.selectOptions(screen.getByLabelText('Widget type'), 'bar-breakdown');

  // Assert
  expect(screen.getByLabelText('Group by')).toBeInTheDocument();
  expect(screen.queryByLabelText('Metric')).not.toBeInTheDocument();
});

it('WidgetComposerSheet — records-table type shows Rows shown', async () => {
  // Arrange
  setup();

  // Act
  await userEvent.selectOptions(screen.getByLabelText('Widget type'), 'records-grid');

  // Assert
  expect(screen.getByLabelText('Rows shown')).toBeInTheDocument();
});

it('WidgetComposerSheet — save with no title — shows an error and does not save', async () => {
  // Arrange
  const { onSave } = setup();

  // Act
  await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));

  // Assert
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a title');
  expect(onSave).not.toHaveBeenCalled();
});

it('WidgetComposerSheet — title + dept scope — saves the draft with the scope', async () => {
  // Arrange
  const { onSave } = setup();

  // Act
  await userEvent.type(screen.getByLabelText('Widget title'), 'Open count');
  await userEvent.click(screen.getByRole('checkbox', { name: 'Dept' }));
  await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));

  // Assert
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'Open count', depts: ['Dept'] }),
  );
});

it('WidgetComposerSheet — accessible in the KPI and records-table states', async () => {
  // Arrange
  const { container } = setup();

  // Assert — KPI state
  expect(await axe(container)).toHaveNoViolations();

  // Act — switch to records-table
  await userEvent.selectOptions(screen.getByLabelText('Widget type'), 'records-grid');

  // Assert — records-table state
  expect(await axe(container)).toHaveNoViolations();
});

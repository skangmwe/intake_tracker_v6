// Component tests for the TaskComposer — covers the Due date input added in Slice 4a: it renders in
// the task panel, submits with the new task when set, and is omitted when left blank. Each render
// carries a jest-axe assertion (web-testing.md).

import { createRef } from 'react';
import { axe } from 'jest-axe';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TaskComposer } from './TaskComposer';

function renderComposer(opts: { onAddTask?: jest.Mock; disabled?: boolean } = {}) {
  const onAddTask = opts.onAddTask ?? jest.fn();
  const onAddBundle = jest.fn();
  const onTab = jest.fn();
  const titleRef = createRef<HTMLInputElement>();
  const utils = render(
    <TaskComposer
      library={[]}
      bundles={[]}
      disabled={opts.disabled ?? false}
      isPending={false}
      tab="task"
      onTab={onTab}
      titleRef={titleRef}
      onAddTask={onAddTask}
      onAddBundle={onAddBundle}
    />,
  );
  return { onAddTask, ...utils };
}

describe('TaskComposer', () => {
  it('TaskComposer — renders the due-date input with no a11y violations', async () => {
    // Arrange
    const { container } = renderComposer();

    // Assert
    expect(screen.getByLabelText('Due date')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('TaskComposer — submits the due date with the new task', async () => {
    // Arrange
    const onAddTask = jest.fn();
    renderComposer({ onAddTask });

    // Act
    await userEvent.type(screen.getByLabelText('New task title'), 'Scope');
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-07-15' } });
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));

    // Assert
    expect(onAddTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Scope', dueDate: '2026-07-15' }));
  });

  it('TaskComposer — omits the due date when left blank', async () => {
    // Arrange
    const onAddTask = jest.fn();
    renderComposer({ onAddTask });

    // Act
    await userEvent.type(screen.getByLabelText('New task title'), 'Scope');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));

    // Assert
    const submitted = onAddTask.mock.calls[0]?.[0] as { dueDate?: string };
    expect(submitted.dueDate).toBeUndefined();
  });
});

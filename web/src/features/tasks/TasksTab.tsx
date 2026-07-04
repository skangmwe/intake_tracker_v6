// The Tasks section of the S4/S5 Tasks & gates tab (slice 7). Phase-grouped collapsible task list
// (navy phase headers), a per-task check-off / notes / typed-field row, and the gray-boxed composer
// (Add task / Add bundle). A pale-gold banner appears when the record is on hold — task completion
// pauses until it returns to Active. Explicit loading / error / empty states
// (web-component-architecture.md). Gates render inline within phase groups in slice 8.

import { useRef, useState } from 'react';
import { CaretDown, CaretRight, PauseCircle, Plus } from '@phosphor-icons/react';

import type { RecordId, TaskCreateRequest, TaskPatchRequest, TaskPhase, WorkspaceId } from '@shared/types';

import { problemMessage } from '@/shared/http/problemMessage';
import { useMe } from '@/features/users/useMe';

import { TaskRow } from './TaskRow';
import { TaskComposer, type AddTaskInput, type ComposerTab } from './TaskComposer';
import { emptyValueForKind, groupTasksByPhase, openTaskCount } from './taskView';
import { useCreateTasks, usePatchTask, useTaskBundles, useTaskLibrary, useTasks } from './useTasks';
import './tasks.css';

interface TasksTabProps {
  recordId: RecordId;
  workspaceId: WorkspaceId;
  /** True when the record is on hold — task completion pauses until it returns to Active. */
  paused: boolean;
}

export function TasksTab({ recordId, workspaceId, paused }: TasksTabProps) {
  const { data: me } = useMe();
  const currentUserId = me?.user.id;

  const { data: tasks, isLoading, isError, error } = useTasks(recordId);
  const { data: bundles } = useTaskBundles(workspaceId);
  const { data: library } = useTaskLibrary(workspaceId);
  const createTasks = useCreateTasks(recordId);
  const patchTask = usePatchTask(recordId);

  const [collapsed, setCollapsed] = useState<ReadonlySet<TaskPhase>>(new Set());
  const [composerTab, setComposerTab] = useState<ComposerTab>('task');
  const titleRef = useRef<HTMLInputElement>(null);

  const focusAddTask = () => {
    setComposerTab('task');
    // Defer focus to after the tab switch renders the input.
    window.setTimeout(() => titleRef.current?.focus(), 0);
  };

  const togglePhase = (phase: TaskPhase) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });

  const addTask = (input: AddTaskInput) => {
    const request: TaskCreateRequest = {
      kind: 'single',
      title: input.title,
      phase: input.phase,
      ...(input.field
        ? { typedField: { definitionId: input.field.definitionId, value: emptyValueForKind(input.field.kind) } }
        : {}),
    };
    createTasks.mutate(request);
  };

  const addBundle = (bundleId: string) => createTasks.mutate({ kind: 'bundle', bundleTemplateId: bundleId });

  const patch = (taskId: string, body: TaskPatchRequest) => patchTask.mutate({ taskId, patch: body });

  const list = tasks ?? [];
  const groups = groupTasksByPhase(list);

  return (
    <section className="tasks" aria-label="Tasks">
      {paused && (
        <div className="tasks-paused" role="status">
          <PauseCircle size={20} aria-hidden />
          <span>
            <span className="tasks-paused__title">This solution is on hold</span>
            <span className="tasks-paused__note">
              Task completion is paused until the status returns to Active.
            </span>
          </span>
        </div>
      )}

      <div className="tasks-header">
        <span className="tasks-header__label">Tasks</span>
        <button type="button" className="tasks-header__add" onClick={focusAddTask}>
          <Plus size={14} aria-hidden /> Add task
        </button>
        <span className="tasks-header__count">{openTaskCount(list)} open</span>
      </div>

      {isLoading && (
        <p className="caption" role="status">
          Loading tasks…
        </p>
      )}

      {isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          {problemMessage(error, 'Tasks could not be loaded. Try again in a moment.')}
        </p>
      )}

      {!isLoading && !isError && groups.length === 0 && (
        <p className="tasks-empty caption">No tasks yet. Add one below or apply a bundle to get started.</p>
      )}

      {!isLoading &&
        !isError &&
        groups.map((group) => {
          const isCollapsed = collapsed.has(group.phase);
          return (
            <div className="task-group" key={group.phase}>
              <button
                type="button"
                className="task-group__header"
                aria-expanded={!isCollapsed}
                onClick={() => togglePhase(group.phase)}
              >
                {isCollapsed ? <CaretRight size={13} aria-hidden /> : <CaretDown size={13} aria-hidden />}
                <span className="task-group__phase">{group.phase}</span>
                <span className="task-group__count">{group.tasks.length}</span>
              </button>
              {!isCollapsed && (
                <ul className="task-list">
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      currentUserId={currentUserId}
                      library={library ?? []}
                      disabled={paused || patchTask.isPending}
                      onPatch={(body) => patch(task.id, body)}
                    />
                  ))}
                </ul>
              )}
            </div>
          );
        })}

      {createTasks.isError && (
        <p className="mws-alert mws-alert--warning" role="alert">
          {problemMessage(createTasks.error, 'That task could not be added. Try again in a moment.')}
        </p>
      )}

      <TaskComposer
        library={library ?? []}
        bundles={bundles ?? []}
        disabled={paused || createTasks.isPending}
        isPending={createTasks.isPending}
        tab={composerTab}
        onTab={setComposerTab}
        titleRef={titleRef}
        onAddTask={addTask}
        onAddBundle={addBundle}
      />
    </section>
  );
}

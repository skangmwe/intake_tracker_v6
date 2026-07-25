// The gray-boxed task composer at the bottom of the Tasks & gates tab (S4/S5). A segmented
// "Add task" / "Add bundle" control switches between adding a single task (title + phase + an
// optional captured field from the workspace library) and applying a bundle template. Presentational:
// TasksTab owns the create mutation and the tab state (so the top "+ Add task" link can switch here
// and focus the title input).

import { type RefObject, useState } from 'react';
import { Plus, StackPlus } from '@phosphor-icons/react';

import type { FieldDefinitionId, TaskBundleTemplate, TaskLibraryFieldDto, TaskPhase } from '@shared/types';

import { Button } from '@/shared/components/Button';

import { PHASE_ORDER, libraryTypeToKind } from './taskView';

export type ComposerTab = 'task' | 'bundle';

export interface AddTaskInput {
  title: string;
  phase: TaskPhase;
  /** Optional planning date (ISO yyyy-MM-dd); omitted when the user left it blank. */
  dueDate?: string;
  field?: { definitionId: FieldDefinitionId; kind: 'url' | 'text' | 'number' | 'date' | 'select' | 'checkbox' };
}

interface TaskComposerProps {
  library: TaskLibraryFieldDto[];
  bundles: TaskBundleTemplate[];
  disabled: boolean;
  isPending: boolean;
  tab: ComposerTab;
  onTab: (tab: ComposerTab) => void;
  titleRef: RefObject<HTMLInputElement | null>;
  onAddTask: (input: AddTaskInput) => void;
  onAddBundle: (bundleId: string) => void;
}

export function TaskComposer({
  library,
  bundles,
  disabled,
  isPending,
  tab,
  onTab,
  titleRef,
  onAddTask,
  onAddBundle,
}: TaskComposerProps) {
  const [title, setTitle] = useState('');
  const [phase, setPhase] = useState<TaskPhase>('Triage');
  const [dueDate, setDueDate] = useState('');
  const [fieldId, setFieldId] = useState('');
  const [bundleId, setBundleId] = useState('');

  const submitTask = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const field = library.find((entry) => entry.id === fieldId);
    // Spread optional members in only when set — exactOptionalPropertyTypes forbids `key: undefined`.
    onAddTask({
      title: trimmed,
      phase,
      ...(dueDate ? { dueDate } : {}),
      ...(field ? { field: { definitionId: field.id, kind: libraryTypeToKind(field.fieldType) } } : {}),
    });
    setTitle('');
    setDueDate('');
    setFieldId('');
  };

  const submitBundle = () => {
    if (!bundleId) return;
    onAddBundle(bundleId);
    setBundleId('');
  };

  return (
    <div className="task-composer" data-ds="card">
      <div className="task-composer__tabs" role="tablist" aria-label="Add tasks">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'task'}
          className={tab === 'task' ? 'task-composer__tab task-composer__tab--active' : 'task-composer__tab'}
          onClick={() => onTab('task')}
        >
          <Plus size={14} aria-hidden /> Add task
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'bundle'}
          className={tab === 'bundle' ? 'task-composer__tab task-composer__tab--active' : 'task-composer__tab'}
          onClick={() => onTab('bundle')}
        >
          <StackPlus size={14} aria-hidden /> Add bundle
        </button>
      </div>

      {tab === 'task' ? (
        <div className="task-composer__panel">
          <div className="task-composer__row">
            <input
              ref={titleRef}
              type="text"
              className="task-composer__title"
              aria-label="New task title"
              placeholder="Task title…"
              disabled={disabled}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <select
              className="task-composer__select"
              aria-label="Task phase"
              disabled={disabled}
              value={phase}
              onChange={(event) => setPhase(event.target.value as TaskPhase)}
            >
              {PHASE_ORDER.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="task-composer__row task-composer__row--field">
            <label className="task-composer__field-label" htmlFor="task-due-date">
              Due date
            </label>
            <input
              id="task-due-date"
              type="date"
              className="task-composer__select"
              disabled={disabled}
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
            <span className="task-composer__hint caption">Optional planning date.</span>
          </div>
          <div className="task-composer__row task-composer__row--field">
            <label className="task-composer__field-label" htmlFor="task-field-picker">
              Capture a field
            </label>
            <select
              id="task-field-picker"
              className="task-composer__select"
              disabled={disabled}
              value={fieldId}
              onChange={(event) => setFieldId(event.target.value)}
            >
              <option value="">No field</option>
              {library.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.displayName}
                </option>
              ))}
            </select>
            <span className="task-composer__hint caption">Defined in Fields &amp; objects.</span>
          </div>
          <div className="task-composer__actions">
            <Button variant="secondary" compact disabled={disabled || isPending || title.trim() === ''} onClick={submitTask}>
              <Plus size={16} aria-hidden /> Add task
            </Button>
          </div>
        </div>
      ) : (
        <div className="task-composer__panel task-composer__panel--bundle">
          <label className="task-composer__field-label" htmlFor="task-bundle-picker">
            Apply a task bundle template
          </label>
          <select
            id="task-bundle-picker"
            className="task-composer__select task-composer__select--wide"
            disabled={disabled}
            value={bundleId}
            onChange={(event) => setBundleId(event.target.value)}
          >
            <option value="">Choose a template…</option>
            {bundles.map((bundle) => (
              <option key={bundle.id} value={bundle.id}>
                {bundle.name}
              </option>
            ))}
          </select>
          <Button variant="secondary" compact disabled={disabled || isPending || bundleId === ''} onClick={submitBundle}>
            <StackPlus size={16} aria-hidden /> Add bundle
          </Button>
        </div>
      )}
    </div>
  );
}

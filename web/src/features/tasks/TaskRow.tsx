// One task row on the Tasks & gates tab (S4/S5). Check-off toggle, title, assignee chip, status
// pill, completed-date chip, a Notes & decisions expander, and — when the task captured a typed
// field — an inline value control keyed by the field's kind. Value edits commit on blur (text-like)
// or on change (select / date / checkbox) so there is no PATCH per keystroke. Titles / notes / field
// values are Confidential — never logged.

import { useEffect, useState } from 'react';
import {
  ArrowBendUpRight,
  ArrowSquareOut,
  CalendarBlank,
  CalendarCheck,
  CheckCircle,
  Circle,
  Lock,
  Note,
  NotePencil,
} from '@phosphor-icons/react';

import type {
  FieldDefinitionId,
  TaskDto,
  TaskLibraryFieldDto,
  TaskPatchRequest,
  TaskTypedFieldValue,
  UserId,
} from '@shared/types';

import { StatusPill } from '@/shared/components/Feedback';
import { formatDate } from '@/shared/utils/dateFormat';

import { formatCompleted, isTaskDone } from './taskView';

type StatusKind = 'info' | 'success' | 'warning' | 'error' | 'neutral';

interface TaskRowProps {
  task: TaskDto;
  currentUserId: UserId | undefined;
  library: TaskLibraryFieldDto[];
  disabled: boolean;
  onPatch: (patch: TaskPatchRequest) => void;
  /** Promote this task to its own Request (copies the parent to a draft + cancels the task). */
  onPromote: () => void;
  /** True while a promote is in flight. */
  promoting: boolean;
}

function statusKind(status: string): StatusKind {
  if (status === 'Done') return 'success';
  if (status === 'Cancelled') return 'neutral';
  return 'info';
}

function assigneeLabel(assignee: UserId | undefined, currentUserId: UserId | undefined): string {
  if (assignee && currentUserId && assignee === currentUserId) return 'You';
  return assignee ? 'A teammate' : 'Unassigned';
}

/** Inline value control for a captured typed field, chosen by the value's kind. */
function TaskFieldValue({
  value,
  definitionId,
  library,
  disabled,
  onPatch,
}: {
  value: TaskTypedFieldValue;
  definitionId: FieldDefinitionId;
  library: TaskLibraryFieldDto[];
  disabled: boolean;
  onPatch: (patch: TaskPatchRequest) => void;
}) {
  const commit = (next: TaskTypedFieldValue) => onPatch({ typedField: { definitionId, value: next } });

  if (value.kind === 'checkbox') {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={value.checked}
        aria-label="Field value"
        className="task-field__checkbox"
        disabled={disabled}
        onClick={() => commit({ kind: 'checkbox', checked: !value.checked })}
      >
        {value.checked ? <CheckCircle size={18} aria-hidden /> : <Circle size={18} aria-hidden />}
        {value.checked ? 'Yes' : 'No'}
      </button>
    );
  }

  if (value.kind === 'date') {
    return (
      <input
        type="date"
        className="task-field__input"
        aria-label="Field value"
        disabled={disabled}
        value={value.date ?? ''}
        onChange={(event) => commit({ kind: 'date', date: event.target.value })}
      />
    );
  }

  if (value.kind === 'select') {
    const options = library.find((field) => field.id === definitionId)?.options ?? [];
    return (
      <select
        className="task-field__input"
        aria-label="Field value"
        disabled={disabled}
        value={value.selectedOption ?? ''}
        onChange={(event) => commit({ kind: 'select', selectedOption: event.target.value })}
      >
        <option value="">Select…</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return <TaskFieldTextValue value={value} disabled={disabled} onCommit={commit} />;
}

/** Text-like value (url / text / number) — controlled locally, committed on blur. */
function TaskFieldTextValue({
  value,
  disabled,
  onCommit,
}: {
  value: Extract<TaskTypedFieldValue, { kind: 'url' | 'text' | 'number' }>;
  disabled: boolean;
  onCommit: (next: TaskTypedFieldValue) => void;
}) {
  const initial =
    value.kind === 'url' ? value.url : value.kind === 'text' ? value.text : value.number != null ? String(value.number) : '';
  const [draft, setDraft] = useState(initial);

  // Re-seed when the committed value changes underneath (e.g. after a refetch).
  useEffect(() => setDraft(initial), [initial]);

  const commit = () => {
    if (value.kind === 'url') onCommit({ kind: 'url', url: draft });
    else if (value.kind === 'text') onCommit({ kind: 'text', text: draft });
    else onCommit({ kind: 'number', number: draft.trim() === '' ? 0 : Number(draft) });
  };

  const isUrl = value.kind === 'url';
  const href = isUrl && draft ? (/^https?:\/\//.test(draft) ? draft : `https://${draft}`) : '';

  return (
    <>
      <input
        type="text"
        inputMode={value.kind === 'number' ? 'numeric' : 'text'}
        className="task-field__input task-field__input--mono"
        aria-label="Field value"
        placeholder={isUrl ? 'https://…' : ''}
        disabled={disabled}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
      />
      {isUrl && href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="task-field__open"
          aria-label="Open link in a new tab"
        >
          <ArrowSquareOut size={15} aria-hidden />
        </a>
      )}
    </>
  );
}

export function TaskRow({ task, currentUserId, library, disabled, onPatch, onPromote, promoting }: TaskRowProps) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState(task.notes ?? '');

  useEffect(() => setNotesDraft(task.notes ?? ''), [task.notes]);

  const done = isTaskDone(task.status);
  const completed = formatCompleted(task.completedAt);
  const due = task.dueDate ? formatDate(task.dueDate) : '';
  const hasNotes = (task.notes ?? '').trim().length > 0;
  // Promote is offered on live tasks only — a done/cancelled task has nothing to promote.
  const canPromote = task.status !== 'Done' && task.status !== 'Cancelled';

  return (
    <li className="task-row">
      <div className="task-row__main">
        <button
          type="button"
          className="task-row__check"
          aria-label={done ? `Reopen ${task.title}` : `Mark ${task.title} done`}
          disabled={disabled}
          onClick={() => onPatch({ status: done ? 'Open' : 'Done' })}
        >
          {done ? <CheckCircle size={20} weight="fill" aria-hidden /> : <Circle size={20} aria-hidden />}
        </button>

        <span className={done ? 'task-row__title task-row__title--done' : 'task-row__title'}>{task.title}</span>

        <span className="task-row__assignee">{assigneeLabel(task.assignee, currentUserId)}</span>

        <StatusPill status={statusKind(task.status)} label={task.status} />

        {due && (
          <span className="task-row__due">
            <CalendarBlank size={13} aria-hidden />
            Due {due}
          </span>
        )}

        {done && completed && (
          <span className="task-row__completed">
            <CalendarCheck size={13} aria-hidden />
            {completed}
          </span>
        )}

        <button
          type="button"
          className={hasNotes ? 'task-row__notes-toggle task-row__notes-toggle--has' : 'task-row__notes-toggle'}
          aria-label="Task notes and decisions"
          aria-expanded={notesOpen}
          onClick={() => setNotesOpen((open) => !open)}
        >
          {hasNotes ? <NotePencil size={14} aria-hidden /> : <Note size={14} aria-hidden />}
          {hasNotes ? 'Notes' : ''}
        </button>

        {canPromote && (
          <button
            type="button"
            className="task-row__promote"
            aria-label={`Promote ${task.title} to a request`}
            disabled={disabled || promoting}
            onClick={onPromote}
          >
            <ArrowBendUpRight size={14} aria-hidden />
            Promote
          </button>
        )}
      </div>

      {task.status === 'Locked' && (
        <span className="task-row__precondition">
          <Lock size={13} aria-hidden />
          Locked until its precondition is met
        </span>
      )}

      {task.typedField && (
        <div className="task-field">
          <span className="task-field__label">{task.typedField.label}</span>
          <TaskFieldValue
            value={task.typedField.value}
            definitionId={task.typedField.definitionId}
            library={library}
            disabled={disabled}
            onPatch={onPatch}
          />
        </div>
      )}

      {notesOpen && (
        <div className="task-field task-field--notes">
          <label className="task-field__label" htmlFor={`notes-${task.id}`}>
            Notes &amp; decisions
          </label>
          <textarea
            id={`notes-${task.id}`}
            className="task-field__textarea"
            rows={3}
            placeholder="Meeting notes, decisions made, follow-ups…"
            disabled={disabled}
            value={notesDraft}
            onChange={(event) => setNotesDraft(event.target.value)}
            onBlur={() => notesDraft !== (task.notes ?? '') && onPatch({ notes: notesDraft })}
          />
        </div>
      )}
    </li>
  );
}

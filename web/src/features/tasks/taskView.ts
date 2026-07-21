// Pure view helpers for the Tasks & gates tab — grouping, counts, formatting, typed-field mapping.
// No React, no I/O (web-file-structure.md). Unit-tested independently of the components.

import type { TaskDto, TaskLibraryFieldType, TaskPhase, TaskStatus, TaskTypedFieldValue } from '@shared/types';

/** Canonical build-phase order for the collapsible phase groups; 'Unphased' always trails. */
export const PHASE_ORDER: readonly TaskPhase[] = [
  'Intake',
  'Triage',
  'Execution',
  'Validation',
  'Delivery',
  'Stabilization',
  'Closeout',
  'Unphased',
];

export interface TaskPhaseGroup {
  phase: TaskPhase;
  tasks: TaskDto[];
}

/**
 * Group tasks by build phase in canonical order, preserving the server's within-phase ordering
 * (open first, completed sink to the bottom). Only phases with tasks are returned.
 */
export function groupTasksByPhase(tasks: TaskDto[]): TaskPhaseGroup[] {
  const buckets = new Map<TaskPhase, TaskDto[]>();
  for (const task of tasks) {
    const phase: TaskPhase = PHASE_ORDER.includes(task.phase) ? task.phase : 'Unphased';
    const bucket = buckets.get(phase);
    if (bucket) bucket.push(task);
    else buckets.set(phase, [task]);
  }
  return PHASE_ORDER.filter((phase) => buckets.has(phase)).map((phase) => ({
    phase,
    tasks: buckets.get(phase) ?? [],
  }));
}

/** Count of tasks that are still open (drives the "N open" header count). */
export function openTaskCount(tasks: TaskDto[]): number {
  return tasks.filter((task) => task.status === 'Open' || task.status === 'Locked').length;
}

/** A task is complete when it has been marked Done. */
export function isTaskDone(status: TaskStatus): boolean {
  return status === 'Done';
}

/** `24 Jun` for a completed-date chip; empty when unparseable. */
export function formatCompleted(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * The empty value for a freshly-captured field (attached on create; the value is filled inline
 * afterward). Empty strings / false store as no-value server-side. Number has no "empty" member in
 * the wire union, so a new Number field starts at 0 until edited.
 */
export function emptyValueForKind(
  kind: 'url' | 'text' | 'number' | 'date' | 'select' | 'checkbox',
): TaskTypedFieldValue {
  switch (kind) {
    case 'url':
      return { kind: 'url', url: '' };
    case 'text':
      return { kind: 'text', text: '' };
    case 'number':
      return { kind: 'number', number: 0 };
    case 'date':
      return { kind: 'date', date: '' };
    case 'select':
      return { kind: 'select', selectedOption: '' };
    case 'checkbox':
      return { kind: 'checkbox', checked: false };
  }
}

/** Task-library field type (S30 vocabulary) → the wire value-kind used on the task typed field. */
export function libraryTypeToKind(fieldType: TaskLibraryFieldType): 'url' | 'text' | 'number' | 'date' | 'select' | 'checkbox' {
  switch (fieldType) {
    case 'Url':
      return 'url';
    case 'Number':
      return 'number';
    case 'Date':
      return 'date';
    case 'Select':
      return 'select';
    case 'Checkbox':
      return 'checkbox';
    default:
      return 'text';
  }
}

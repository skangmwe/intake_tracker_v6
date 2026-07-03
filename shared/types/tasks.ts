// Tasks — lightweight children of Requests (BS §2.4).

import type { FieldDefinitionId, IsoDate, IsoDateTime, RecordId, TaskId, UserId } from './common';

/** Task status transitions: Locked → Open → Done (or Cancelled). */
export type TaskStatus = 'Locked' | 'Open' | 'Done' | 'Cancelled';

/** Build phase — for the collapsible phase-grouped task list. */
export type TaskPhase = 'Intake' | 'Discovery' | 'Build' | 'QA' | 'Deploy' | 'Post-launch' | 'Unphased';

/** Type-aware structured field value on a Task. */
export type TaskTypedFieldValue =
  | { kind: 'url'; url: string }
  | { kind: 'text'; text: string }
  | { kind: 'number'; number: number }
  | { kind: 'date'; date: IsoDate }
  | { kind: 'select'; selectedOption: string }
  | { kind: 'checkbox'; checked: boolean };

export interface TaskTypedField {
  definitionId: FieldDefinitionId;
  /** Human label — copied from the field definition at creation time. */
  label: string;
  value: TaskTypedFieldValue;
}

export interface TaskDto {
  id: TaskId;
  parentRequestId: RecordId;
  title: string;
  phase: TaskPhase;
  assignee?: UserId;
  status: TaskStatus;
  /**
   * The condition-engine rule that gates this Task (BS §2.4). When unmet, status = Locked.
   * Not an inter-task dependency — keys on field values on the parent Request or the Task itself.
   */
  preconditionId?: string;
  /** Optional structured typed field the Task is meant to produce. */
  typedField?: TaskTypedField;
  /** Per-task Notes & decisions — expandable free-text (per prototype changelog). */
  notes?: string;
  completedAt?: IsoDateTime;
  createdAt: IsoDateTime;
}

/** POST /requests/{id}/tasks — single task OR apply a bundle template. */
export type TaskCreateRequest =
  | {
      kind: 'single';
      title: string;
      phase: TaskPhase;
      assignee?: UserId;
      preconditionId?: string;
      typedField?: { definitionId: FieldDefinitionId; value: TaskTypedFieldValue };
    }
  | { kind: 'bundle'; bundleTemplateId: string };

export interface TaskPatchRequest {
  title?: string;
  phase?: TaskPhase;
  assignee?: UserId;
  status?: TaskStatus;
  typedField?: { definitionId: FieldDefinitionId; value: TaskTypedFieldValue } | null;
  notes?: string;
}

/** A task-bundle template — a named set of tasks applied together (per prototype). */
export interface TaskBundleTemplate {
  id: string;
  name: string;
  tasks: Array<{
    title: string;
    phase: TaskPhase;
    typedFieldDefinitionId?: FieldDefinitionId;
    /** Marks a slot that should render inline sign-off UI (a proto-gate task). */
    isSignoff?: boolean;
  }>;
}

// S33 Workspace audit constants (slice 18). The event-type filter options + human labels, and the
// per-category StatusPill mapping for the audit table. Enumerable UI options are a typed module-level
// constant, not inline JSX (web-component-architecture.md). Values mirror the EventType union in
// /shared/types/notifications.ts — a mismatch would silently filter nothing.

import type { EventType } from '@shared/types';

interface EventTypeOption {
  value: EventType;
  label: string;
}

/** Coarse grouping used to tint the event badge (paired with the label — never colour alone). */
export type EventGroup = 'record' | 'gate' | 'escalation' | 'catalog' | 'announcement' | 'task' | 'comment' | 'attachment' | 'config';

/** Every EventType, grouped, with a plain-language label for the filter select + table. */
export const EVENT_TYPE_OPTIONS: readonly EventTypeOption[] = [
  { value: 'request.created', label: 'Request created' },
  { value: 'request.updated', label: 'Request updated' },
  { value: 'request.hold.set', label: 'Hold set' },
  { value: 'request.hold.cleared', label: 'Hold cleared' },
  { value: 'request.stage.advanced', label: 'Stage advanced' },
  { value: 'request.closed', label: 'Request closed' },
  { value: 'gate.opened', label: 'Gate opened' },
  { value: 'gate.decision.submitted', label: 'Gate decision submitted' },
  { value: 'gate.re-requested', label: 'Gate re-requested' },
  { value: 'gate.resolved', label: 'Gate resolved' },
  { value: 'escalation.opened', label: 'Escalation opened' },
  { value: 'escalation.crossed-field.snapshotted', label: 'Crossed field snapshotted' },
  { value: 'feature.created', label: 'Feature created' },
  { value: 'feature.published', label: 'Feature published' },
  { value: 'feature.deprecated', label: 'Feature deprecated' },
  { value: 'announcement.published', label: 'Announcement published' },
  { value: 'task.created', label: 'Task created' },
  { value: 'task.updated', label: 'Task updated' },
  { value: 'task.done', label: 'Task done' },
  { value: 'comment.posted', label: 'Comment posted' },
  { value: 'comment.mention.fired', label: 'Mention fired' },
  { value: 'attachment.uploaded', label: 'Attachment uploaded' },
  { value: 'config.field.updated', label: 'Field config updated' },
  { value: 'config.gate.updated', label: 'Gate config updated' },
  { value: 'config.workspace.provisioned', label: 'Workspace provisioned' },
] as const;

const LABEL_BY_VALUE: Map<string, string> = new Map(
  EVENT_TYPE_OPTIONS.map((option) => [option.value, option.label]),
);

/** Human label for an event type; falls back to the raw type for any future/unmapped value. */
export function eventTypeLabel(eventType: string): string {
  return LABEL_BY_VALUE.get(eventType) ?? eventType;
}

/** The coarse group for an event type (drives the badge tint). Prefix-based so new sub-types map. */
export function eventGroup(eventType: string): EventGroup {
  const prefix = eventType.split('.')[0];
  switch (prefix) {
    case 'gate':
      return 'gate';
    case 'escalation':
      return 'escalation';
    case 'feature':
      return 'catalog';
    case 'announcement':
      return 'announcement';
    case 'task':
      return 'task';
    case 'comment':
      return 'comment';
    case 'attachment':
      return 'attachment';
    case 'config':
      return 'config';
    default:
      return 'record';
  }
}

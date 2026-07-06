// Tests for the audit event-type constants — the human labels and the coarse group mapping that
// drives the badge tint. Covers every group branch of eventGroup plus the label fallback.

import { eventGroup, eventTypeLabel, EVENT_TYPE_OPTIONS } from './constants';

it('eventTypeLabel — known type — returns the plain-language label', () => {
  expect(eventTypeLabel('gate.resolved')).toBe('Gate resolved');
  expect(eventTypeLabel('request.created')).toBe('Request created');
});

it('eventTypeLabel — unknown type — falls back to the raw type', () => {
  expect(eventTypeLabel('future.unmapped.event')).toBe('future.unmapped.event');
});

it('eventGroup — maps each prefix to its group', () => {
  expect(eventGroup('request.created')).toBe('record');
  expect(eventGroup('gate.opened')).toBe('gate');
  expect(eventGroup('escalation.opened')).toBe('escalation');
  expect(eventGroup('feature.published')).toBe('catalog');
  expect(eventGroup('announcement.published')).toBe('announcement');
  expect(eventGroup('task.done')).toBe('task');
  expect(eventGroup('comment.posted')).toBe('comment');
  expect(eventGroup('attachment.uploaded')).toBe('attachment');
  expect(eventGroup('config.gate.updated')).toBe('config');
});

it('eventGroup — unknown prefix — defaults to record', () => {
  expect(eventGroup('mystery.thing')).toBe('record');
});

it('every option value has a resolvable label (no orphans)', () => {
  for (const option of EVENT_TYPE_OPTIONS) {
    expect(eventTypeLabel(option.value)).toBe(option.label);
  }
});

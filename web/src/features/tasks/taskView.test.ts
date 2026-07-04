// Unit tests for the pure task-view helpers — grouping, counts, formatting, and typed-field mapping
// (web-testing.md). No render, no I/O.

import type { TaskDto, TaskId, RecordId } from '@shared/types';

import {
  PHASE_ORDER,
  emptyValueForKind,
  formatCompleted,
  groupTasksByPhase,
  isTaskDone,
  libraryTypeToKind,
  openTaskCount,
} from './taskView';

function buildTask(overrides: Partial<TaskDto> = {}): TaskDto {
  return {
    id: (overrides.id ?? 'task-1') as TaskId,
    parentRequestId: 'AIS-00000001' as RecordId,
    title: 'A task',
    phase: 'Build',
    status: 'Open',
    createdAt: '2026-07-01T09:00:00Z',
    ...overrides,
  };
}

describe('groupTasksByPhase', () => {
  it('groupTasksByPhase — groups in canonical order with Unphased trailing', () => {
    // Arrange — deliberately out of canonical order.
    const tasks = [
      buildTask({ id: 't1' as TaskId, phase: 'Unphased' }),
      buildTask({ id: 't2' as TaskId, phase: 'Build' }),
      buildTask({ id: 't3' as TaskId, phase: 'Discovery' }),
    ];

    // Act
    const groups = groupTasksByPhase(tasks);

    // Assert — Discovery before Build before Unphased.
    expect(groups.map((group) => group.phase)).toEqual(['Discovery', 'Build', 'Unphased']);
  });

  it('groupTasksByPhase — preserves within-phase order and omits empty phases', () => {
    // Arrange
    const tasks = [
      buildTask({ id: 'a' as TaskId, phase: 'Build', title: 'First' }),
      buildTask({ id: 'b' as TaskId, phase: 'Build', title: 'Second' }),
    ];

    // Act
    const groups = groupTasksByPhase(tasks);

    // Assert — only Build appears, in server order.
    expect(groups).toHaveLength(1);
    expect(groups[0]?.tasks.map((task) => task.title)).toEqual(['First', 'Second']);
  });
});

describe('openTaskCount', () => {
  it('openTaskCount — counts Open and Locked, excludes Done and Cancelled', () => {
    // Arrange
    const tasks = [
      buildTask({ status: 'Open' }),
      buildTask({ status: 'Locked' }),
      buildTask({ status: 'Done' }),
      buildTask({ status: 'Cancelled' }),
    ];

    // Act + Assert
    expect(openTaskCount(tasks)).toBe(2);
  });
});

describe('isTaskDone', () => {
  it('isTaskDone — true only for Done', () => {
    expect(isTaskDone('Done')).toBe(true);
    expect(isTaskDone('Open')).toBe(false);
  });
});

describe('formatCompleted', () => {
  it('formatCompleted — formats an ISO date', () => {
    expect(formatCompleted('2026-06-24T14:00:00Z')).toMatch(/24|Jun/);
  });

  it('formatCompleted — returns empty for undefined or unparseable', () => {
    expect(formatCompleted(undefined)).toBe('');
    expect(formatCompleted('not-a-date')).toBe('');
  });
});

describe('libraryTypeToKind', () => {
  it('libraryTypeToKind — maps every library type to a wire kind', () => {
    expect(libraryTypeToKind('Url')).toBe('url');
    expect(libraryTypeToKind('Text')).toBe('text');
    expect(libraryTypeToKind('Number')).toBe('number');
    expect(libraryTypeToKind('Date')).toBe('date');
    expect(libraryTypeToKind('Select')).toBe('select');
    expect(libraryTypeToKind('Checkbox')).toBe('checkbox');
  });
});

describe('emptyValueForKind', () => {
  it('emptyValueForKind — builds an empty value per kind', () => {
    expect(emptyValueForKind('url')).toEqual({ kind: 'url', url: '' });
    expect(emptyValueForKind('checkbox')).toEqual({ kind: 'checkbox', checked: false });
    expect(emptyValueForKind('number')).toEqual({ kind: 'number', number: 0 });
    expect(emptyValueForKind('select')).toEqual({ kind: 'select', selectedOption: '' });
  });
});

describe('PHASE_ORDER', () => {
  it('PHASE_ORDER — ends with Unphased', () => {
    expect(PHASE_ORDER[PHASE_ORDER.length - 1]).toBe('Unphased');
  });
});

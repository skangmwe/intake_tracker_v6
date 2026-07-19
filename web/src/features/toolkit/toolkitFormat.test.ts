// Unit tests for the Toolkit presentation maps (pure functions — no render, no axe).

import { BookOpen, ChatText, Plug } from '@phosphor-icons/react';

import { kindIcon, kindPillClass, statusBadgeClass, TOOLKIT_KINDS, TOOLKIT_STATUSES } from './toolkitFormat';

describe('toolkitFormat', () => {
  it('kindIcon — each kind maps to its Phosphor icon', () => {
    // Arrange + Act + Assert
    expect(kindIcon('Playbook')).toBe(BookOpen);
    expect(kindIcon('Plugin')).toBe(Plug);
    expect(kindIcon('Prompt')).toBe(ChatText);
  });

  it('kindPillClass — each kind maps to its pale pill class', () => {
    expect(kindPillClass('Playbook')).toBe('tk-pill--playbook');
    expect(kindPillClass('Plugin')).toBe('tk-pill--plugin');
    expect(kindPillClass('Prompt')).toBe('tk-pill--prompt');
  });

  it('statusBadgeClass — each status maps to its badge tone', () => {
    expect(statusBadgeClass('Active')).toBe('tk-badge--live');
    expect(statusBadgeClass('Draft')).toBe('tk-badge--pending');
    expect(statusBadgeClass('Archived')).toBe('tk-badge--archived');
  });

  it('option lists — expose the three kinds and three statuses', () => {
    expect(TOOLKIT_KINDS).toEqual(['Playbook', 'Plugin', 'Prompt']);
    expect(TOOLKIT_STATUSES).toEqual(['Active', 'Draft', 'Archived']);
  });
});

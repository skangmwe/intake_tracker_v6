// Unit tests for the S32 management model — audience parsing, building, and summarising. Pure.

import type { AnnouncementAudience, UserId } from '@shared/types';

import {
  buildAudience,
  parseRoleLabels,
  roleLabelsToText,
  summarizeAudience,
} from './dashboardsAdminModel';

describe('parseRoleLabels', () => {
  it('parseRoleLabels — comma and newline separated — trims, de-dupes, drops empties', () => {
    // Arrange
    const text = 'Analyst, Reviewer\nAnalyst, ,  Lead ';

    // Act
    const result = parseRoleLabels(text);

    // Assert
    expect(result).toEqual(['Analyst', 'Reviewer', 'Lead']);
  });

  it('parseRoleLabels — blank — empty list', () => {
    expect(parseRoleLabels('   ')).toEqual([]);
  });
});

describe('roleLabelsToText', () => {
  it('roleLabelsToText — role-scoped audience — joins labels', () => {
    const audience: AnnouncementAudience = { kind: 'role-scoped', roleLabels: ['A', 'B'] };
    expect(roleLabelsToText(audience)).toBe('A, B');
  });

  it('roleLabelsToText — everyone — empty string', () => {
    expect(roleLabelsToText({ kind: 'everyone' })).toBe('');
  });
});

describe('buildAudience', () => {
  it('buildAudience — everyone — bare everyone shape', () => {
    expect(buildAudience('everyone', 'ignored', { kind: 'everyone' })).toEqual({ kind: 'everyone' });
  });

  it('buildAudience — role-scoped — parses the labels text', () => {
    const result = buildAudience('role-scoped', 'Analyst, Reviewer', { kind: 'everyone' });
    expect(result).toEqual({ kind: 'role-scoped', roleLabels: ['Analyst', 'Reviewer'] });
  });

  it('buildAudience — named-users — preserves existing userIds', () => {
    const existing: AnnouncementAudience = { kind: 'named-users', userIds: ['u1' as UserId] };
    expect(buildAudience('named-users', '', existing)).toEqual({
      kind: 'named-users',
      userIds: ['u1'],
    });
  });
});

describe('summarizeAudience', () => {
  it('summarizeAudience — everyone', () => {
    expect(summarizeAudience({ kind: 'everyone' })).toBe('Everyone');
  });

  it('summarizeAudience — role-scoped with labels', () => {
    expect(summarizeAudience({ kind: 'role-scoped', roleLabels: ['Analyst'] })).toBe(
      'Role-scoped · Analyst',
    );
  });

  it('summarizeAudience — named-users pluralises', () => {
    expect(summarizeAudience({ kind: 'named-users', userIds: ['a' as UserId, 'b' as UserId] })).toBe(
      'Named users · 2 people',
    );
    expect(summarizeAudience({ kind: 'named-users', userIds: ['a' as UserId] })).toBe(
      'Named users · 1 person',
    );
  });
});

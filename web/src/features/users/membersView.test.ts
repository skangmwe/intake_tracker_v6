// selectMembersView — the pure client-side sort / filter / paginate for the members list. Covers
// name + last-active sorting (both directions, null-last-active handling), level and status filters,
// pagination slicing, and the filtered-to-zero result.

import type { WorkspaceMemberDto } from '@shared/types';

import { buildInvitation, buildMember } from '@/test-utils';

import { selectMembersView } from './membersView';

const ada = buildMember({ displayName: 'Ada', email: 'ada@mws.ai', level: 'WorkspaceAdmin', lastActiveAt: '2026-07-10T00:00:00Z' });
const bo = buildMember({ displayName: 'Bo', email: 'bo@mws.ai', level: 'Member', lastActiveAt: '2026-07-01T00:00:00Z', status: 'Suspended' });
const cy = buildMember({ displayName: 'Cy', email: 'cy@mws.ai', level: 'Viewer', lastActiveAt: '2026-07-20T00:00:00Z' });
const invite = buildInvitation({ email: 'zed@mws.ai', level: 'Viewer' });
const ALL: WorkspaceMemberDto[] = [cy, ada, invite, bo];

describe('selectMembersView', () => {
  it('selectMembersView — no sort, no filter — returns all rows in source order', () => {
    // Act
    const result = selectMembersView(ALL, undefined, {}, 1, 25);

    // Assert
    expect(result.rows).toEqual(ALL);
    expect(result.total).toBe(4);
    expect(result.start).toBe(1);
    expect(result.end).toBe(4);
  });

  it('selectMembersView — sort by name ascending — orders by display identifier', () => {
    // Act
    const result = selectMembersView(ALL, { column: 'name', direction: 'asc' }, {}, 1, 25);

    // Assert — Ada, Bo, Cy, then the invitation (email "zed") last
    expect(result.rows.map((member) => member.email)).toEqual([
      'ada@mws.ai',
      'bo@mws.ai',
      'cy@mws.ai',
      'zed@mws.ai',
    ]);
  });

  it('selectMembersView — sort by name descending — reverses the order', () => {
    // Act
    const result = selectMembersView(ALL, { column: 'name', direction: 'desc' }, {}, 1, 25);

    // Assert
    expect(result.rows[0]?.email).toBe('zed@mws.ai');
    expect(result.rows[3]?.email).toBe('ada@mws.ai');
  });

  it('selectMembersView — sort by last active ascending — null last-active sorts oldest', () => {
    // Act — the invitation has no last-active, so it sorts first when ascending.
    const result = selectMembersView(ALL, { column: 'lastActive', direction: 'asc' }, {}, 1, 25);

    // Assert
    expect(result.rows[0]?.email).toBe('zed@mws.ai');
    expect(result.rows[result.rows.length - 1]?.email).toBe('cy@mws.ai');
  });

  it('selectMembersView — status select filter — keeps only matching rows', () => {
    // Act
    const result = selectMembersView(ALL, undefined, { status: { kind: 'select', values: ['Suspended'] } }, 1, 25);

    // Assert
    expect(result.rows).toEqual([bo]);
    expect(result.total).toBe(1);
  });

  it('selectMembersView — level select filter — keeps only matching rows', () => {
    // Act
    const result = selectMembersView(ALL, undefined, { level: { kind: 'select', values: ['Viewer'] } }, 1, 25);

    // Assert
    expect(result.rows.map((member) => member.email).sort()).toEqual(['cy@mws.ai', 'zed@mws.ai']);
  });

  it('selectMembersView — name text filter — matches the display name case-insensitively', () => {
    // Act
    const result = selectMembersView(ALL, undefined, { name: { kind: 'text', contains: 'aD' } }, 1, 25);

    // Assert — only "Ada" contains "ad".
    expect(result.rows.map((member) => member.email)).toEqual(['ada@mws.ai']);
  });

  it('selectMembersView — email text filter — matches on the email', () => {
    // Act
    const result = selectMembersView(ALL, undefined, { email: { kind: 'text', contains: 'zed' } }, 1, 25);

    // Assert
    expect(result.rows.map((member) => member.email)).toEqual(['zed@mws.ai']);
  });

  it('selectMembersView — last-active date filter — keeps rows inside the range and drops nulls', () => {
    // Act — from 2026-07-05 excludes bo (Jul 1) and the invite (no last-active).
    const result = selectMembersView(
      ALL,
      undefined,
      { lastActive: { kind: 'date', from: '2026-07-05' } },
      1,
      25,
    );

    // Assert
    expect(result.rows.map((member) => member.email).sort()).toEqual(['ada@mws.ai', 'cy@mws.ai']);
  });

  it('selectMembersView — last-active date filter with an upper bound — excludes later rows', () => {
    // Act — to 2026-07-05 keeps only bo (Jul 1); ada (Jul 10) and cy (Jul 20) fall after it.
    const result = selectMembersView(ALL, undefined, { lastActive: { kind: 'date', to: '2026-07-05' } }, 1, 25);

    // Assert
    expect(result.rows.map((member) => member.email)).toEqual(['bo@mws.ai']);
  });

  it('selectMembersView — date filter with an unparseable last-active — excludes that row', () => {
    // Arrange
    const broken = buildMember({ email: 'nan@mws.ai', lastActiveAt: 'not-a-date' });

    // Act
    const result = selectMembersView([broken, ada], undefined, { lastActive: { kind: 'date', from: '2026-01-01' } }, 1, 25);

    // Assert — the invalid timestamp is dropped; only ada survives.
    expect(result.rows.map((member) => member.email)).toEqual(['ada@mws.ai']);
  });

  it('selectMembersView — pagination — slices to the requested page', () => {
    // Act — page 2 of a page-size-2 view over 4 rows.
    const result = selectMembersView(ALL, { column: 'name', direction: 'asc' }, {}, 2, 2);

    // Assert
    expect(result.rows.map((member) => member.email)).toEqual(['cy@mws.ai', 'zed@mws.ai']);
    expect(result.totalPages).toBe(2);
    expect(result.start).toBe(3);
    expect(result.end).toBe(4);
  });

  it('selectMembersView — filters exclude everything — reports an empty view', () => {
    // Act — Invited status intersected with Member level matches no one (the invite is a Viewer).
    const result = selectMembersView(
      ALL,
      undefined,
      { status: { kind: 'select', values: ['Invited'] }, level: { kind: 'select', values: ['Member'] } },
      1,
      25,
    );

    // Assert
    expect(result.total).toBe(0);
    expect(result.rows).toEqual([]);
    expect(result.start).toBe(0);
    expect(result.end).toBe(0);
  });
});

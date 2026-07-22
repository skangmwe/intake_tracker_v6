// selectAnnouncementsView — the pure client-side filter / sort / paginate for the manage table. Covers
// the ANNOUNCEMENT text filter, POSTED sort (both directions, missing timestamps sort last), pagination
// slicing, and the filtered-to-zero result.

import type { AnnouncementListRow } from '@shared/types';

import { isFilterActive, selectAnnouncementsView } from './announcementsView';

function row(overrides: Partial<AnnouncementListRow> = {}): AnnouncementListRow {
  return {
    id: 'a1' as AnnouncementListRow['id'],
    title: 'Announcement',
    bodySnippet: 'Preview',
    pinned: false,
    status: 'Active',
    author: 'u1' as AnnouncementListRow['author'],
    ...overrides,
  };
}

const freeze = row({
  id: 'a-freeze' as AnnouncementListRow['id'],
  title: 'Q3 intake freeze',
  postedAt: '2026-07-05T09:31:00Z',
});
const repoUrl = row({
  id: 'a-repo' as AnnouncementListRow['id'],
  title: 'New Repo URL field',
  postedAt: '2026-07-02T11:00:00Z',
});
const gate = row({
  id: 'a-gate' as AnnouncementListRow['id'],
  title: 'Lifecycle change: QA gate',
  postedAt: '2026-06-28T14:20:00Z',
});
const ALL: AnnouncementListRow[] = [freeze, repoUrl, gate];

describe('selectAnnouncementsView', () => {
  it('selectAnnouncementsView — no sort, no filter — returns all rows in source order', () => {
    // Act
    const result = selectAnnouncementsView(ALL, undefined, {}, 1, 10);

    // Assert
    expect(result.rows).toEqual(ALL);
    expect(result.total).toBe(3);
    expect(result.start).toBe(1);
    expect(result.end).toBe(3);
  });

  it('selectAnnouncementsView — sort posted ascending — orders oldest first', () => {
    // Act
    const result = selectAnnouncementsView(ALL, { column: 'posted', direction: 'asc' }, {}, 1, 10);

    // Assert
    expect(result.rows.map((entry) => entry.id)).toEqual(['a-gate', 'a-repo', 'a-freeze']);
  });

  it('selectAnnouncementsView — sort posted descending — orders newest first', () => {
    // Act
    const result = selectAnnouncementsView(ALL, { column: 'posted', direction: 'desc' }, {}, 1, 10);

    // Assert
    expect(result.rows.map((entry) => entry.id)).toEqual(['a-freeze', 'a-repo', 'a-gate']);
  });

  it('selectAnnouncementsView — sort posted with a missing timestamp — sorts that row last ascending', () => {
    // Arrange
    const undated = row({ id: 'a-undated' as AnnouncementListRow['id'], title: 'Undated' });

    // Act
    const result = selectAnnouncementsView(
      [undated, ...ALL],
      { column: 'posted', direction: 'asc' },
      {},
      1,
      10,
    );

    // Assert — the undated row falls to the bottom, dated rows keep their order.
    expect(result.rows.map((entry) => entry.id)).toEqual([
      'a-undated',
      'a-gate',
      'a-repo',
      'a-freeze',
    ]);
  });

  it('selectAnnouncementsView — title-contains filter — keeps only matching rows', () => {
    // Act
    const result = selectAnnouncementsView(
      ALL,
      undefined,
      { title: { kind: 'text', contains: 'repo' } },
      1,
      10,
    );

    // Assert
    expect(result.rows.map((entry) => entry.id)).toEqual(['a-repo']);
  });

  it('selectAnnouncementsView — filter excludes everything — returns zero rows with start 0', () => {
    // Act
    const result = selectAnnouncementsView(
      ALL,
      undefined,
      { title: { kind: 'text', contains: 'zzz' } },
      1,
      10,
    );

    // Assert
    expect(result.total).toBe(0);
    expect(result.rows).toHaveLength(0);
    expect(result.start).toBe(0);
  });

  it('selectAnnouncementsView — page size smaller than total — slices the page', () => {
    // Act
    const page2 = selectAnnouncementsView(ALL, { column: 'posted', direction: 'desc' }, {}, 2, 2);

    // Assert — page 2 of a 2-per-page, 3-row set holds the last row.
    expect(page2.rows.map((entry) => entry.id)).toEqual(['a-gate']);
    expect(page2.totalPages).toBe(2);
    expect(page2.start).toBe(3);
    expect(page2.end).toBe(3);
  });

  it('isFilterActive — empty and populated funnel values', () => {
    // Assert
    expect(isFilterActive(undefined)).toBe(false);
    expect(isFilterActive({ kind: 'text' })).toBe(false);
    expect(isFilterActive({ kind: 'text', contains: '  ' })).toBe(false);
    expect(isFilterActive({ kind: 'text', contains: 'x' })).toBe(true);
  });
});

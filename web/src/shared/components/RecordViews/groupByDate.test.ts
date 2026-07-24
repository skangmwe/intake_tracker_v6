import { formatDate } from '@/shared/utils/dateFormat';

import { groupByDate, formatDayLabel, NO_DATE } from './groupByDate';
import type { RecordViewItem } from './types';

const noop = () => undefined;

function item(id: string, dateValue?: string): RecordViewItem {
  return { id, title: id, dateValue, onOpen: noop };
}

describe('groupByDate', () => {
  it('groupByDate — mixed dates — groups by day in ascending order', () => {
    // Arrange
    const items = [item('c', '2026-07-20'), item('a', '2026-07-01'), item('b', '2026-07-10')];

    // Act
    const groups = groupByDate(items);

    // Assert
    expect(groups.map((group) => group.key)).toEqual(['2026-07-01', '2026-07-10', '2026-07-20']);
  });

  it('groupByDate — same day different times — collapses into one group', () => {
    // Arrange
    const items = [item('a', '2026-07-01T09:00:00Z'), item('b', '2026-07-01T17:30:00Z')];

    // Act
    const groups = groupByDate(items);

    // Assert
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items).toHaveLength(2);
  });

  it('groupByDate — items without a date — collects into a trailing No date group', () => {
    // Arrange
    const items = [item('dated', '2026-07-01'), item('undated')];

    // Act
    const groups = groupByDate(items);

    // Assert — dateless group is last
    expect(groups[groups.length - 1]?.key).toBe(NO_DATE);
    expect(groups[groups.length - 1]?.items.map((entry) => entry.id)).toEqual(['undated']);
  });

  it('formatDayLabel — ISO day — renders a human day label', () => {
    // Act + Assert
    expect(formatDayLabel('2026-07-16')).toBe(formatDate(new Date(2026, 6, 16)));
  });

  it('formatDayLabel — unparseable input — returns the raw string', () => {
    // Act + Assert
    expect(formatDayLabel('not-a-date')).toBe('not-a-date');
  });
});

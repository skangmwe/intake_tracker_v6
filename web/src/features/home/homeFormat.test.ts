// Unit tests for the Home presentation helpers (pure — no DOM). A fixed `now` makes relative phrasing
// deterministic.

import {
  activityPresentation,
  dueBadgeClass,
  formatDue,
  formatRelative,
  formatSince,
  formatWaiting,
} from './homeFormat';

const NOW = new Date('2026-07-06T12:00:00Z');

describe('formatRelative', () => {
  it('formatRelative — under a minute — Just now', () => {
    // Arrange + Act + Assert
    expect(formatRelative('2026-07-06T11:59:30Z', NOW)).toBe('Just now');
  });

  it('formatRelative — hours ago — pluralises', () => {
    expect(formatRelative('2026-07-06T10:00:00Z', NOW)).toBe('2 hrs ago');
    expect(formatRelative('2026-07-06T11:00:00Z', NOW)).toBe('1 hr ago');
  });

  it('formatRelative — one day ago — Yesterday', () => {
    expect(formatRelative('2026-07-05T09:00:00Z', NOW)).toBe('Yesterday');
  });

  it('formatRelative — several days ago — day count', () => {
    expect(formatRelative('2026-07-03T09:00:00Z', NOW)).toBe('3 days ago');
  });

  it('formatRelative — invalid input — empty string', () => {
    expect(formatRelative('not-a-date', NOW)).toBe('');
  });
});

describe('formatWaiting', () => {
  it('formatWaiting — days — pluralised', () => {
    expect(formatWaiting('2026-07-04T12:00:00Z', NOW)).toBe('Waiting 2 days');
  });

  it('formatWaiting — hours — singular', () => {
    expect(formatWaiting('2026-07-06T11:00:00Z', NOW)).toBe('Waiting 1 hour');
  });

  it('formatWaiting — minutes floor at one', () => {
    expect(formatWaiting('2026-07-06T11:59:50Z', NOW)).toBe('Waiting 1 min');
  });
});

describe('formatSince', () => {
  it('formatSince — null — first-visit fallback', () => {
    expect(formatSince(null)).toBe('your last visit');
  });

  it('formatSince — a date — not the fallback', () => {
    expect(formatSince('2026-07-01T00:00:00Z')).not.toBe('your last visit');
  });

  it('formatSince — invalid — fallback', () => {
    expect(formatSince('nope')).toBe('your last visit');
  });
});

describe('dueBadgeClass', () => {
  it('dueBadgeClass — overdue and due-soon get a tint, others none', () => {
    expect(dueBadgeClass('Overdue')).toBe('home-badge home-badge--overdue');
    expect(dueBadgeClass('DueSoon')).toBe('home-badge home-badge--due-soon');
    expect(dueBadgeClass('OnTrack')).toBeNull();
    expect(dueBadgeClass(null)).toBeNull();
  });
});

describe('formatDue', () => {
  it('formatDue — no date — No due date', () => {
    expect(formatDue(null, null, NOW)).toBe('No due date');
  });

  it('formatDue — overdue SLA — Overdue label', () => {
    expect(formatDue('2026-07-01', 'Overdue', NOW)).toBe('Overdue');
  });

  it('formatDue — due today — Due today', () => {
    expect(formatDue('2026-07-06', 'DueSoon', NOW)).toBe('Due today');
  });

  it('formatDue — future dated — Due <date>', () => {
    expect(formatDue('2026-07-20', 'OnTrack', NOW)).toMatch(/^Due /);
  });
});

describe('activityPresentation', () => {
  it('activityPresentation — gate event — resolves an icon and label', () => {
    // Arrange + Act
    const presentation = activityPresentation('gate.resolved');

    // Assert
    expect(presentation.Icon).toBeDefined();
    expect(presentation.label).toBe('Gate resolved');
  });

  it('activityPresentation — closed record — labels from the audit map', () => {
    expect(activityPresentation('request.closed').label).toBe('Request closed');
  });

  it('activityPresentation — unknown type — falls back to the raw label', () => {
    expect(activityPresentation('future.unmapped').label).toBe('future.unmapped');
  });
});

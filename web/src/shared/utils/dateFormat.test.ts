import { formatDate, formatDateTime } from './dateFormat';

// These assertions are locale-independent: they verify the *shape* (numeric, slash-separated,
// no word-month) which is the whole point of the change — order (mm/dd vs dd/mm) is delegated to
// the runtime locale and intentionally not pinned here.

const NUMERIC_DATE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
const HAS_TIME = /\d{1,2}:\d{2}/;

describe('formatDate', () => {
  it('formatDate — a valid ISO date — renders numeric mm/dd/yyyy with no word-month', () => {
    // Arrange
    const iso = '2026-07-24T00:00:00Z';

    // Act
    const result = formatDate(iso);

    // Assert
    expect(result).toMatch(NUMERIC_DATE);
    expect(result).not.toMatch(/[A-Za-z]/);
    expect(result).toContain('2026');
  });

  it('formatDate — a day past the 12th — keeps day and month unambiguous as two digits', () => {
    // Arrange / Act
    const result = formatDate('2026-07-24T12:00:00Z');

    // Assert — 24 can only be the day, 07 the month, in either locale order
    expect(result).toEqual(expect.stringContaining('24'));
    expect(result).toEqual(expect.stringContaining('07'));
  });

  it.each([null, undefined, '', 'not-a-date'])(
    'formatDate — %p — returns empty string',
    (input) => {
      // Act / Assert
      expect(formatDate(input)).toBe('');
    },
  );
});

describe('formatDateTime', () => {
  it('formatDateTime — a valid instant — renders numeric date, year, and a time', () => {
    // Act
    const result = formatDateTime('2026-07-24T09:31:00Z');

    // Assert
    expect(result).toContain('2026');
    expect(result).toMatch(HAS_TIME);
    expect(result).not.toMatch(/Jul|July/);
  });

  it('formatDateTime — unparseable input — returns empty string', () => {
    expect(formatDateTime(undefined)).toBe('');
  });
});

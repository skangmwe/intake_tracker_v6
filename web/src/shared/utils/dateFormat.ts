// Locale-aware date formatting — the single source of truth for how calendar dates render.
//
// Order and separators follow the viewer's browser/OS locale: passing `undefined` as the locale
// to Intl means en-US renders "07/24/2026" and en-GB renders "24/07/2026" automatically, so the
// US-vs-Europe switch needs no setting or profile field. We use numeric (2-digit) month/day rather
// than a word month ("24 Jul") so every date reads as mm/dd/yyyy (US) or dd/mm/yyyy (Europe) —
// see ux-copy-and-microcopy.md (locale-aware formatting, not hardcoded). Every displayed date
// includes the year — there is deliberately no year-less variant.

type DateInput = string | number | Date | null | undefined;

const DATE_OPTS: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

/** Parse any accepted input to a valid Date, or null when absent/unparseable. */
function toDate(input: DateInput): Date | null {
  if (input === null || input === undefined || input === '') return null;
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Calendar date with year — "07/24/2026" (en-US) / "24/07/2026" (en-GB). '' when unparseable. */
export function formatDate(input: DateInput): string {
  const date = toDate(input);
  return date ? date.toLocaleDateString(undefined, DATE_OPTS) : '';
}

/** Date + time with year — "07/24/2026, 09:31 AM" (locale-ordered date, locale time). '' when unparseable. */
export function formatDateTime(input: DateInput): string {
  const date = toDate(input);
  return date ? date.toLocaleString(undefined, { ...DATE_OPTS, ...TIME_OPTS }) : '';
}

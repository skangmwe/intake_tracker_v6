// Shared date helpers for the announcement editors — ISO instant ↔ the `YYYY-MM-DDTHH:mm` local
// wall-clock value a datetime-local input expects, plus the auto-archive date note.

import { AUTO_ARCHIVE_DAYS } from './constants';

const MS_PER_DAY = 86_400_000;

/** An ISO instant → the `YYYY-MM-DDTHH:mm` local value a datetime-local input expects. */
export function isoToLocalInput(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** The local value from a datetime-local input → an ISO instant, or '' when unparseable. */
export function localInputToIso(local: string): string {
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/** The "moves to Archived on {date}" date, `baseMs + AUTO_ARCHIVE_DAYS`. */
export function formatArchiveDate(baseMs: number): string {
  return new Date(baseMs + AUTO_ARCHIVE_DAYS * MS_PER_DAY).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

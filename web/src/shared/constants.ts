// Shared timing / sizing constants. Debounce delays, polling intervals, and search timeouts must be
// named constants defined once here and imported — never redefined as literals per file
// (web-coding-standards.md).

/** Debounce before the intake similar-requests nudge queries as the user types (S3, BS §9.8). */
export const SIMILAR_DEBOUNCE_MS = 400;

/** Minimum query length before the similar-requests nudge fires — mirrors the proc's token floor. */
export const SIMILAR_MIN_QUERY_LENGTH = 3;

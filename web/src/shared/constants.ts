// Shared timing / sizing constants. Debounce delays, polling intervals, and search timeouts must be
// named constants defined once here and imported — never redefined as literals per file
// (web-coding-standards.md).

/** Debounce before the intake similar-requests nudge queries as the user types (S3, BS §9.8). */
export const SIMILAR_DEBOUNCE_MS = 400;

/** Minimum query length before the similar-requests nudge fires — mirrors the proc's token floor. */
export const SIMILAR_MIN_QUERY_LENGTH = 3;

/** Debounce before the top-bar workspace search queries as the user types (S27, BS §9.5). */
export const SEARCH_DEBOUNCE_MS = 300;

/** Minimum query length before workspace search fires — mirrors the proc's 3-char token floor. */
export const SEARCH_MIN_QUERY_LENGTH = 3;

/** Page size for the S27 full Search results surface. */
export const SEARCH_RESULTS_PAGE_SIZE = 20;

/** Poll interval for a CSV import's status while it is still Processing (S28, BS §13). */
export const IMPORT_POLL_INTERVAL_MS = 2000;

/** Rows the import wizard previews from a chosen CSV (header + first N data rows) before mapping. */
export const CSV_PREVIEW_ROW_LIMIT = 10;

/** Page size for the S33 workspace audit log (BS §12). */
export const AUDIT_LOG_PAGE_SIZE = 25;

/** Page size for the S30 Objects tab list. Large enough that the small object set fits one page. */
export const OBJECTS_PAGE_SIZE = 25;

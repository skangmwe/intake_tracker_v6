// Named tunables for the Lifecycle & gates surface (web-coding-standards.md — no magic numbers;
// debounce delays are named constants imported wherever needed, never inline literals).

/** Delay after the last structural edit before the lifecycle config autosaves. */
export const AUTOSAVE_DEBOUNCE_MS = 800;

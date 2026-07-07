// Token-only colour helpers for the dashboard widgets. Every value references an MWS token through
// color-mix or a token var — never a raw hex/rgb (web-styling.md; the conformance hook blocks raw
// colours). Ramps and mixes mirror the prototype's inline expressions exactly.

/** Segmented-bar ramp (Inflight status) — 4 tints of the interactive accent over the surface. */
const SEGMENT_RAMP = [30, 53, 77, 100];

export function segmentColor(index: number): string {
  const pct = SEGMENT_RAMP[index] ?? SEGMENT_RAMP[SEGMENT_RAMP.length - 1];
  return `color-mix(in srgb, var(--accent-interactive) ${pct}%, var(--bg-surface))`;
}

/** Outcome palette (Closures + closed heatmap cells). Keyed by the outcome label. */
export const OUTCOME_COLORS: Record<string, string> = {
  Live: 'var(--color-success)',
  Declined: 'var(--color-gold)',
  Withdrawn: 'var(--color-orange)',
  Duplicate: 'var(--color-magenta)',
};

/** A bar/outcome colour, falling back to the accent when the label is unknown. */
export function outcomeColor(label: string): string {
  return OUTCOME_COLORS[label] ?? 'var(--accent-interactive)';
}

/** In-flight heatmap cell fill — pale-blue ramp keyed by count (transparent at zero). */
export function inflightCellBg(count: number): string {
  if (count === 0) return 'transparent';
  const mix = Math.min(100, 25 + count * 25);
  return `color-mix(in srgb, var(--color-pale-blue) ${mix}%, var(--bg-surface))`;
}

/** Closed heatmap cell fill — outcome ramp keyed by count (transparent at zero). */
export function closedCellBg(outcome: string, count: number): string {
  if (count === 0) return 'transparent';
  const mix = Math.min(100, 35 + count * 30);
  return `color-mix(in srgb, ${outcomeColor(outcome)} ${mix}%, var(--bg-surface))`;
}

/** Cell foreground — theme-stable navy on a filled cell, secondary on an empty one. */
export function cellForeground(count: number, alwaysNavyWhenFilled: boolean): string {
  if (count === 0) return 'var(--text-secondary)';
  if (alwaysNavyWhenFilled || count >= 2) return 'var(--color-navy)';
  return 'var(--text-primary)';
}

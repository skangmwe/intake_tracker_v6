---
name: McDermott Loading, Empty & Error States
description: 'Use when designing skeleton screens, spinners, loading states, empty states, zero-data states, error states, network errors, 404s, server errors, recovery actions, fallback UI, or any "in-between" UI state.'
version: 1.0.0
---
# McDermott Loading, Empty & Error States
The states most teams under-design. Get these right and the product feels considered.
## Latency thresholds — when to show what
**Scope:** this table is for general data-fetch and processing waits (lists loading, reports generating, uploads, exports). AI streaming uses a different table with finer-grained thresholds — see `ai-streaming-and-perceived-latency.md`. Don't mix them.

| Latency | Treatment |
|---|---|
| < 100ms | Nothing. Don't flash a spinner. |
| 100–500ms | Subtle skeleton or progress indicator. No text. |
| 500ms – 3s | Skeleton with progressive content reveal as data arrives. |
| 3s – 10s | Explain what's happening ("Generating your report…") + offer cancel. |
| > 10s | Show progress percentage if known, ETA if possible. Always allow cancel. |
## Skeleton vs spinner vs progress bar
- **Skeleton** — when you know the layout of the result (lists, cards, tables, articles). Use `var(--color-navy-gray-1)` blocks animating to `var(--color-navy-gray-2)`, `--duration-slow` infinite alternate.
- **Spinner** — for unknown-shape outcomes or short waits inside a button or icon. Phosphor `circle-notch` rotating.
- **Progress bar** — when progress is known (uploads, multi-step processing). Determinate; never fake progress.
- **Indeterminate progress bar** — only when the wait is bounded but progress is unknown. Pulse animation in `var(--accent-interactive)`.
## Empty states
Three flavors. Don't conflate them.
### Zero-data (first run)
The user hasn't created anything yet.
- Pale background surface (`--color-pale-blue` or similar) with rounded illustration or large Phosphor icon.
- Title (Mix Regular, 24pt): "No projects yet"
- Body (Sans Light, 16pt): one sentence explaining the value of creating one.
- **Primary CTA** to take the first action.
### Filtered-to-zero
The user has data but the filter excluded all of it.
- Smaller, less ceremonial. No illustration.
- **Surface:** `var(--bg-surface)` background with 1px `var(--border-light)` border. **Never use a pale-fill** here — pale fills are reserved for first-run/zero-data ceremony, and reusing them for filtered-to-zero conflates two different states. The subtle bordered card communicates "no chrome, this is a routine state."
- Text: `var(--text-primary)` for the title, `var(--text-secondary)` for the body (theme-aware, since the surface itself is theme-aware here — unlike the pale-fill zero-data variant).
- Title: "No matches for your filters"
- Body: suggest specific filter changes.
- **Secondary CTA**: "Clear filters" or "Reset search."
### Permission/access empty
The user can't see anything because they don't have access.
- Title: "You don't have access to this"
- Body: explain who to ask for access (specific role/person if possible).
- CTA: "Request access" if applicable, otherwise nothing.
## Error states
| Type | Surface | Recovery |
|---|---|---|
| Network failure | Inline banner | Retry |
| Timeout | Inline banner | Retry |
| Server error (5xx) | Inline banner or full-page | Retry, then contact support |
| Permission denied | Full-page or inline | Request access, go back |
| Not found (404) | Full-page | Go to nearest known good route |
| Validation error | Inline next to field | (See Forms skill) |
| Conflict (409) | Modal or banner | Show diff, let user choose |
**Error message formula:** what happened + (if known) why + how to recover. Never show raw stack traces or error codes to end users — log them, hide them, optionally let users expand "Technical details" for support.
## Recovery actions
Every error state needs at least one path forward:
- **Retry** — for transient failures. Make the button obvious.
- **Go back** — for routing errors.
- **Contact support** — for unrecoverable errors. Pre-populate the support form with the error context.
Never strand the user with no action.
## McDermott-specific
- Empty state surfaces use the four pale backgrounds (`--color-pale-*`) — remember the **theme-stable foreground rule**: text on these surfaces is `var(--color-navy)` always, never `var(--text-primary)`.
- Error inline banners follow the standard inline-alert pattern (4px left border in the severity color, pale fill, navy text) — `notifications-and-feedback.md` is the canonical owner. Load it alongside this file when wiring error surfaces.
- Loading skeletons use `var(--color-navy-gray-1)` → `var(--color-navy-gray-2)` for internal UIs only; client-facing uses pale backgrounds + opacity pulse.
- All loading animations respect `prefers-reduced-motion` — fall back to static low-opacity placeholders.
## Mobile considerations
- **Empty-state padding** reduces on mobile: `var(--space-6)` on phones vs `var(--space-8)` on desktop.
- **Hero illustrations** cap at 120px on phones, 200px on desktop. Below 320px viewport, an icon (48px) is sufficient.
- **Empty-state CTAs stack vertically** on phones with the primary action taking full width. Side-by-side only at ≥640px.
- **Error message buttons** (retry, contact support) must stack via `flex-wrap: wrap` so they don't end up at viewport edges.
- **Skeleton rows in tables** must match the responsive layout below them — if the real table compresses 6 columns to 4 on mobile, the skeletons must compress too. Otherwise the page jumps when data arrives.
- **Long error copy** wraps via `overflow-wrap: break-word` — error messages often contain URLs, file paths, or technical details that don't have natural break points.
- **Filtered-to-zero in tables**: the inline "no matches" row spans all columns; the "Clear filters" CTA stays centered and fits at any viewport.

See `responsive-and-mobile.md` for the universal responsive checklist.
## Anti-patterns — Never Do This
- Show a spinner for sub-100ms operations (causes flash)
- Use a generic spinner when a skeleton would communicate the result shape
- Fake progress bar percentages (users notice, trust collapses)
- Strand the user in an error state with no recovery action
- Show raw error codes or stack traces to end users
- Use the same empty state copy for first-run and filtered-to-zero
- Use illustrations in filtered-to-zero (over-ceremonial for an everyday state)
- Apply alert text colors instead of using navy on alert fills
- Skip the empty state and just show a blank screen
- Use `--text-primary` token on a pale empty-state background (white-on-pale in dark mode)

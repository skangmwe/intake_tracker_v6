---
name: McDermott Notifications & Feedback
description: 'Use when designing toasts, snackbars, banners, inline alerts, status badges, success messages, error notifications, warning messages, system feedback, confirmation messages, or how the application communicates state changes to users.'
version: 1.0.0
---
# McDermott Notifications & Feedback
How the system talks back to the user. Different from `McDermott Disclosure Surfaces` (which is about revealing user-initiated content) — this is about the system communicating state.
## Decision matrix
| Surface | Use when |
|---|---|
| **Toast / snackbar** | Transient confirmation of a user action ("Saved", "Deleted") |
| **Banner** | Persistent system-wide message (maintenance, plan limits, account issues) |
| **Inline alert** | Contextual to a section or form ("Your changes affect 3 other items") |
| **Status badge** | Persistent state indicator next to an item (Live, Draft, Archived) |
| **Modal** | (See `McDermott Disclosure Surfaces`) — only when blocking is required |
## Toasts
- Position: bottom-right (desktop), bottom-center (mobile), `var(--space-5)` from edges.
- Width: 360px max desktop, full-width minus margins on mobile. Express this as `max-width: min(360px, calc(100vw - var(--space-5) * 2))` — a `right: 24px; max-width: 360px` toast extends off-screen left at viewports below ~408px without that viewport-aware cap.
- Stack a maximum of 3 visible. Beyond that, collapse into a notification center.
- Auto-dismiss timing:
  - Info / success: 5 seconds
  - Warning: 8 seconds OR persistent until acknowledged
  - **Error: never auto-dismiss** — user must dismiss explicitly
- Include an action button when applicable ("Undo", "View", "Retry").
- Animation: slide-in from edge, `--duration-slow` `--ease-emphasis`. Slide-out + fade on dismiss.
## Banners
- Span the full width of their container, top of page or section.
- 4px left border in the severity color, fill in the matching pale background.
- Always dismissible (X button) unless the message is genuinely blocking.
- One banner at a time per region — never stack banners.
## Inline alerts
Inline within a section, full width, same visual treatment as banners (4px left border + pale fill) with smaller padding. Use for contextual warnings, success states, or informational notes within a workflow.
## Status badges
- Pill shape (`var(--radius-pill)`), `var(--space-1)` `var(--space-3)` padding, 12pt ALL CAPS, 5% letter-spacing.
- Always pair color with a label — never use a colored dot alone.
- **Default to pale fills, not saturated alert colors.** A "Live" badge using saturated `--color-success` shouts; using `--color-pale-success` whispers. Status badges are reference, not interruption — they should sit comfortably alongside body content.
- For the few cases where the saturated color is justified (a "FATAL" log severity, a critical bell), use the accent color but only in genuinely attention-demanding contexts.

| Status | Background | Text | Notes |
|---|---|---|---|
| Live (success) | `--color-pale-success` | `--color-navy` | Optional 6×6 dot in `--color-success` to the left of the label |
| Pending (warning) | `--color-pale-gold` | `--color-navy` | |
| Failed (error) | `--color-pale-orange` | `--color-navy` | |
| Draft (neutral) | transparent | `--text-primary` | 1px `--border-light` border |
| Archived (neutral muted) | transparent | `--text-secondary` | 1px `--border-light` border |

Never use `--color-navy-gray-*` for badges in client-facing UI — those tokens are internal-only. Use the transparent + bordered treatment for neutral states instead.
## Severity treatment (McDermott)
**Default to the subtle (pale-fill) variant for in-app alerts and banners.** The saturated alert colors are reserved for accent borders, status badges, and the rare prominent warning. Mixing fills (some pale, some saturated) within the same surface looks broken — pick one mode per surface and stay consistent.

| Severity | Background fill | Border / accent | Text | Icon (Phosphor) |
|---|---|---|---|---|
| Info | `--color-pale-blue` | `--color-blue` | `--color-navy` | `info` |
| Success | `--color-pale-success` (subtle, default) — `--color-success` only when the success needs to be celebratory | `--color-success` | `--color-navy` | `check-circle` |
| Warning | `--color-pale-gold` (subtle, default) — `--color-warning` only for genuinely attention-demanding warnings | `--color-warning` | `--color-navy` | `warning-circle` |
| Error | `--color-pale-orange` (subtle, default) — `--color-error` only when blocking | `--color-error` | `--color-navy` | `x-circle` |

**Reminder:** Per the McDermott theme-stable foreground rule, text on alert fills (`--color-error`, `--color-success`, `--color-warning`, and the pale fills) is **always navy**, never the themed `--text-primary`.
## When silent success is correct
**Don't toast for:** autosave, sending a chat message, adding to a list, trivial settings changes. The result appearing IS the confirmation.
**Do toast for:** destructive actions (with Undo), background actions whose result the user can't see (export queued), actions that succeed with caveats ("Saved, but 2 items couldn't sync").
## Notification center
For persistent or unread notifications. Top bar trigger (Phosphor `bell`) with badge count.
- List ordered newest-first.
- Each notification has timestamp, severity, message, and action.
- Mark-all-read action.
- Clear individual notifications.
## McDermott-specific
- Notifications use `--font-sans` 14pt for body, `--font-sans` 14pt bold for action buttons.
- Toasts use `var(--bg-surface)` background with severity color as a 4px left border (subtle), or full pale-fill + colored border (prominent) — pick one and stay consistent.
- Animation timing matches McDermott motion tokens; never instant.

## Mobile considerations
- **Toast position**: **bottom-center on mobile** (not bottom-right). Width: `calc(100vw - 32px)` with `var(--space-4)` padding. Stack vertically; max 3 visible.
- **Toast actions** (if any): inline on the right of the message; tap target ≥36×36.
- **Banners**: full-width on mobile with content padded `var(--space-3)`. Icon and text stay on the same row; never stack the icon above text.
- **Status badges in dense rows**: stay pill-shaped and fully visible — never truncate the status word. If the row is too narrow for the badge, hide it from the row and surface it in the row-detail view instead.
- **Notification center**: full-screen sheet on mobile, not a popover from the bell icon. Each notification has comfortable tap height (≥56px).
- **Inline alerts in forms**: stack their action buttons vertically on phones via `flex-wrap`.
- **Long status text** (e.g., "Last saved 12 min ago by Alex on Mac"): compress to icon + 1–2 word abbreviation on mobile. Full text only in a tap-revealed detail.

See `responsive-and-mobile.md` for the universal checklist.

## Anti-patterns — Never Do This
- Stack more than 3 toasts visible
- Auto-dismiss error toasts
- Use red text inside an error toast (text on alert fills must be navy)
- Use a banner for a transient confirmation (use a toast)
- Use a toast for a persistent issue (use a banner)
- Use a colored dot alone as a status indicator (always pair with label)
- Show a notification count without a way to clear it
- Animate notifications past `--duration-slow` (becomes obtrusive)
- Toast every successful action (creates fatigue; reserve for actions with consequence)
- Stack banners on top of each other
- Toast `max-width: 360px` with no `min(360px, calc(100vw - X))` cap — the toast extends off the opposite edge on narrow viewports

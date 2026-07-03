---
name: McDermott Disclosure Surfaces
description: 'Use when deciding between or building modals, dialogs, side sheets, drawers, bottom sheets, popovers, dropdowns, tooltips, accordions, inline expansions, or full-page routes. Use when revealing additional content, secondary actions, or contextual UI.'
version: 1.0.0
---
# McDermott Disclosure Surfaces
Decisions about *how to reveal* additional content or actions. Pairs with `McDermott Navigation & IA` for "where things live."
## Decision matrix
Pick the surface from the **relationship between the content and what the user is doing**.
| Relationship | Surface |
|---|---|
| Must act before continuing | **Modal** — blocking, focus-trapped |
| Related to the main view; user might reference both | **Side sheet** (desktop) / **bottom sheet** (mobile) — non-blocking |
| Brief, contextual, anchored to a trigger | **Popover / dropdown** |
| Part of the page's content flow | **Inline expansion / accordion** |
| Substantial standalone task; should be back-button-able | **Full page or new route** |
## Modal
Use only when the user **must respond before continuing** (destructive confirmation, required input, session timeout).
- Centered. Max-width 560px for forms, 480px for confirmations.
- Width on narrow viewports: `width: min(90vw, 480px)` so the modal scales down without ever filling the entire screen.
- Scrim: `rgba(0, 0, 0, 0.5)` with `backdrop-filter: blur(4px)` where supported. No fallback — never block content behind a missing-blur scrim.
- Focus is trapped inside the modal; first focusable element receives focus on open.
- Close on Escape, on scrim click (unless confirming destructive action), and via explicit close button.
- Restore focus to the triggering element on close.
- Animation: `transform: scale(0.96) → scale(1)` + opacity fade, `--duration-slow` `--ease-emphasis`.
- **Never nest modals.** If a flow needs more than one, redesign as a multi-step modal or full page.
- **Modal action row must `flex-wrap: wrap`.** Two McDermott buttons (140px min-width each + gap) won't fit a typical 256px modal-content area at narrow widths. Without `flex-wrap`, the second button gets cut off the right edge of the modal.
## Side sheet (desktop) / Bottom sheet (mobile)
Use for **secondary content related to the main view** — filter panels, item detail next to a list, contextual settings. User can reference both.
- Side sheet: 360–480px wide, slides in from the right. Slides over content; does not push.
- Bottom sheet: takes 60–90% of viewport height, slides up from bottom. Drag handle at top.
- Non-blocking: outside content remains visible and partially dismissible (no focus trap by default).
- Dismiss on outside click, Escape, swipe-down (bottom sheet), and explicit close.
- Animation: slide + opacity, `--duration-slow` `--ease-emphasis`.
## Popover / dropdown
Use for **brief contextual choices anchored to a trigger** — action menus, date pickers, "more options."
- Anchored to and visually connected to the trigger (no scrim).
- Width: content-driven, max 320px.
- **Viewport-aware max-width** to prevent off-screen extension on narrow phones: `max-width: calc(100vw - var(--space-5) * 2)`. A min-width of 220px is fine on desktop but must be capped at narrow widths.
- Auto-position: prefer below + aligned to start; flip to above if no room.
- Close on outside click, Escape, selection (for menus), trigger toggle.
- Animation: opacity fade only, `--duration-fast` `--ease-standard`.
- Returns focus to trigger on close.
## Inline expansion / accordion
Use when content is **part of the page's flow** and shouldn't displace context — FAQs, expandable table rows, "show more" sections.
- Trigger uses Phosphor `caret-down` rotating 180° on expand.
- Animate height + opacity, `--duration-base` `--ease-standard`.
- Multiple accordion items may be open simultaneously (don't auto-collapse siblings unless space is constrained).
## Full page / new route
Use for **substantial standalone tasks** that should be back-button-able — editing a complex record, multi-step workflows, anything you'd want to share via URL.
- The browser back button must do the right thing.
- Provide an explicit close/cancel that returns the user where they came from.
## McDermott-specific treatments
- Scrim color: `rgba(0, 0, 66, 0.5)` (navy-tinted, not pure black) on light theme; `rgba(0, 0, 0, 0.6)` on dark theme.
- All surfaces use `var(--bg-surface)` background, `var(--radius)` (2px) corners.
- Border above scrim: 1px `var(--border-light)`.
- Headers in disclosure surfaces use `--font-mix` (Georgia), 24pt, sentence case.
## Anti-patterns — Never Do This
- Nest modals inside modals
- Use a modal where a side sheet would do (over-blocks the user)
- Use a popover for tasks needing real estate (use a sheet or page)
- Open a full page when a popover would do (over-disrupts context)
- Use `border-radius` > 2px on disclosure surfaces (violates McDermott radius rule)
- Skip focus trap on a modal
- Skip focus restore on close (leaves keyboard users stranded)
- Auto-dismiss a modal that confirms a destructive action
- Use scrim blur on browsers that don't support it without testing the fallback (often results in blocked unreadable content)
- Animate height with `transition: all` (jank — animate `height` and `opacity` explicitly)
- Action button row inside a modal/sheet/permission with `display: flex` but no `flex-wrap: wrap` — at narrow viewports the second 140px-min-width button gets cut off
- Popover with a `min-width` but no `max-width` cap — extends off-screen at narrow viewports

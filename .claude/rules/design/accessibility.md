---
name: McDermott Accessibility
description: 'Use when reviewing or building for accessibility, WCAG compliance, ARIA, keyboard navigation, screen readers, focus management, color contrast, touch targets, alt text, semantic HTML, reduced motion, or any a11y concern.'
version: 1.0.0
---
# McDermott Accessibility
WCAG 2.2 Level AA is the **minimum bar** for every McDermott surface. Not negotiable.

## Color contrast
- Body text: ≥ 4.5:1 against background
- Large text (18pt+ or 14pt+ bold): ≥ 3:1
- Non-text UI (icons, borders, focus indicators): ≥ 3:1
- Disabled controls exempt but still visually distinct

**Never rely on color alone** to convey state. Pair color with icon, label, weight, or pattern.

## Keyboard navigation
- Every interactive element reachable via Tab, operable via Enter/Space
- Tab order follows visual reading order
- No keyboard traps — Tab always exits eventually
- Focus trap acceptable (and required) inside modals — Escape exits
- Skip-to-main-content link as the first focusable element on every page
- Custom components match native keyboard expectations:
  - **Tabs:** Left/Right arrows + Home/End
  - **Menus:** Up/Down arrows + Enter to activate
  - **Comboboxes:** typeahead + arrow keys
  - **Sliders:** arrow keys ± Home/End

## Focus indicators
- 2px outline at `--focus-ring` (blue light / teal dark) with 2px offset
- Use `:focus-visible` not `:focus` so mouse users don't see rings on click
- **Never** `outline: none` without a visible replacement (most common a11y bug)
- Focus indicator meets 3:1 contrast against adjacent background

## Semantic HTML first
ARIA is the **last resort**. Use semantic HTML first:
- `<button>` not `<div role="button">`
- `<a href>` not `<div onclick>`
- `<nav>`, `<main>`, `<aside>`, `<header>`, `<footer>` for landmarks
- `<h1>`–`<h6>` in correct hierarchy (don't skip levels)
- `<label>` for every form input

## ARIA when needed
- Live regions (`aria-live="polite"|"assertive"`) for dynamic content — toasts, AI streaming, validation errors
- `aria-expanded`, `aria-controls`, `aria-selected` on disclosure widgets
- `aria-current="page"` on the active nav item
- `aria-describedby` to link inputs to helper text and errors
- `aria-hidden="true"` on purely decorative icons; meaningful icons need an accessible label

## Screen reader patterns
- Non-decorative images have meaningful `alt`. Decorative use `alt=""`.
- Icon-only buttons need `aria-label` or visually-hidden text.
- Visually-hidden utility:
  ```css
  .visually-hidden {
    position: absolute; width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden;
    clip: rect(0,0,0,0); white-space: nowrap; border: 0;
  }
  ```
- Don't use `display: none` to hide content from sighted users that you want screen readers to read.

## Touch targets
- Min 44×44px (iOS) / 48×48dp (Android)
- ≥ 8px spacing between adjacent targets
- McDermott button (140×36) — pad the click target if visual size is smaller

## Reduced motion
- Respect `prefers-reduced-motion: reduce` on every animation
- Replace movement with opacity-only transitions — never `transition: none`
- Auto-playing video, parallax, decorative animations all gate on this preference
- When motion *is* appropriate and how to add it: see `_core-requirements.md` ('Adding motion')

## Forms
- Every input has a programmatic label (`<label for>` or `aria-label`)
- Errors use `aria-invalid="true"` and `aria-describedby` pointing to the error message
- Required inputs use `required` (with visible "(optional)" marking on optional fields per forms skill)
- Don't auto-advance focus or auto-submit — keyboard users have no chance to review

## Captions, transcripts, alt text
Video has captions for spoken content. Audio has transcripts. Images have alt describing information value, not visual appearance.

## Testing checklist
- [ ] Tab through every interactive element with focus visible
- [ ] Operate every control with keyboard alone
- [ ] Automated checker (axe, Lighthouse) — zero critical issues
- [ ] VoiceOver (Mac) / NVDA (Windows) for primary user flow
- [ ] Verify color contrast on every text/background pair
- [ ] Toggle `prefers-reduced-motion` and confirm no jank
- [ ] Test at 200% zoom — content reflows, nothing cut off

## McDermott-specific
The McDermott palette has known-good pairs (navy on white = 19:1, navy on teal = 7.4:1). Confirm any other pairing. The pale-bg + navy-text rule (theme-stable foreground) exists partly for contrast — never override. Focus rings use `--focus-ring` which flips per theme — test both.

## Mobile a11y
- **Touch targets ≥ 24×24** (SC 2.5.8 AA), ≥ 44×44 preferred. Pad with transparent space.
- **Test VoiceOver (iOS) + TalkBack (Android)** — touch SR gestures differ from desktop.
- **Mobile keyboard covers content** — on focus, scroll input into view via `scroll-margin-top` + `element.scrollIntoView()`.
- **Never disable browser zoom** (`user-scalable=no` is an AA violation). Inputs need `font-size ≥ 16px` to avoid iOS auto-zoom.
- **`prefers-reduced-motion` matters more on mobile** (motion sickness held close).
- **Focus indicators still matter** — keyboard nav happens via Bluetooth keyboards and switch devices.

See `responsive-and-mobile.md` for the universal checklist.

## Anti-patterns
- `outline: none` without a visible replacement · `<div onclick>` instead of `<button>`/`<a>`
- Color as the sole indicator of state · skipping heading levels (h2 → h4)
- Placeholder as the only label · meaningful icons without an accessible label
- Decorative icons without `aria-hidden` · auto-playing audio/video without user control
- Disabling browser zoom · trap keyboard focus outside modals
- Treating WCAG AA as a stretch goal

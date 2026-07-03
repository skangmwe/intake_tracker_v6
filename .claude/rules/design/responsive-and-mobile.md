---
name: McDermott Responsive & Mobile
description: 'Load alongside ANY component-building task. Mobile responsiveness is non-negotiable for every component, layout, and surface — not an optional add-on. Triggers on responsive layouts, mobile-first CSS, breakpoints, touch targets, mobile navigation, gestures, viewport handling, mobile keyboards, hover-on-touch fallbacks, or any UI work whatsoever.'
version: 2.0.0
---
# McDermott Responsive & Mobile

## Mandate: every component is responsive. No exceptions.
Every component must work from a 320px phone viewport to 1920px+ desktop, in light and dark theme. If it doesn't pass the checklist, it's not done. Load this skill alongside every component-building task.

## Mobile design is editing, not scaling
The most common mobile failure: treating mobile as a *scaled-down* desktop. Density assumptions baked into desktop layouts break when uniformly compressed. The fix is **editorial**: for each element, decide **keep, remove, move, reshape, or replace**.

- **Keep** — fits and earns its space at every viewport
- **Remove** — duplicative breadcrumbs, decorative status, "could be there" buttons
- **Move** — sidebar → drawer, top-bar status → contextual card, multi-column → single-column
- **Reshape** — labels → icons, dropdowns → bottom sheets, side-by-side → stacked, comfortable density → compact
- **Replace** — autosave sentence → `cloud-check` icon, hover affordance → tap-revealed sheet, wizard → single-step with progress

If the only answer for everything is "keep," the layout is overloaded — the responsive bug is already in the design.

## The non-negotiable responsive checklist
- [ ] Works at 320px viewport — no horizontal page scroll
- [ ] Touch targets ≥ 24×24 (≥44×44 preferred for primary)
- [ ] No fixed pixel widths exceeding 320px without an overflow strategy
- [ ] Flex/grid items have `min-width: 0` if they contain overflowing content
- [ ] Long unbroken strings wrap via `overflow-wrap: break-word`
- [ ] Header content doesn't wrap word-by-word — collapse per `app-shell-and-headers.md`
- [ ] Tested in light AND dark at narrow viewport
- [ ] Sticky positioning still works (use `overflow-x: clip` on html, not `hidden` on body)
- [ ] Hover-only affordances have a touch equivalent
- [ ] No `user-scalable=no` in viewport meta (a11y violation)

## Breakpoints (mobile-first, `min-width` queries only)
`--bp-sm: 640` · `--bp-md: 768` · `--bp-lg: 1024` (sidebar appears) · `--bp-xl: 1280` · `--bp-2xl: 1536`

## Touch & hover
Touch targets minimum 44×44 (iOS) / 48×48dp (Android), 8px between adjacent. Visual size can be smaller — pad the click area with transparent space. Every hover state needs a touch equivalent — never put critical info in a hover-only tooltip.

## Layout patterns
- **Sidebar** → drawer below `--bp-lg`. See `navigation-and-ia.md`.
- **Multi-column** → single-column below `--bp-md`.
- **Tables** → stacked cards on mobile, or horizontal scroll with sticky first column. See `data-visualization.md`.
- **Forms** → single-column at every breakpoint.
- **Mobile patterns:** pull-to-refresh on feeds; swipe actions (always also expose via tap); bottom sheets instead of modals; long-press always has a visible alternative.

## Mobile keyboard handling
Use `inputmode` (`numeric`, `email`, `tel`, `url`, `search`, `decimal`) and `autocomplete` (`given-name`, `email`, `current-password`, `one-time-code`) so password managers and autofill work. Use `enterkeyhint` to label the Enter key. Never disable autofill or paste. Avoid `autofocus` on page load (viewport jump). Input font-size ≥ 16px on iOS — anything smaller forces zoom-in on focus.

## Viewport meta & safe areas
```html
<meta name="viewport" content="width=device-width, initial-scale=1">
```
Never set `maximum-scale` or `user-scalable=no`. Use `env(safe-area-inset-bottom)` on bottom tab bars and fixed buttons on notched devices.

## Reduced motion
Respect `prefers-reduced-motion: reduce` on every animation — replace movement with opacity-only transitions. Stricter on mobile (motion sickness in transit). See `_core-requirements.md` ('Adding motion') for when motion is appropriate and how to add it.

## CSS gotchas — the bugs that break responsive

### The overflow cascade
A single overflowing element pushes every ancestor wider than the viewport. `overflow-x: hidden` on body alone isn't enough — body clips its children but html still scrolls.
```css
html { overflow-x: clip; max-width: 100vw; }
body { max-width: 100vw; }
.app { max-width: 100vw; min-width: 0; }
main, section { max-width: 100%; min-width: 0; }
```

### Flex `min-width: auto`
Flex items default to `min-width: auto` (intrinsic content size). A flex item containing a 900px-wide table refuses to shrink below 900px. Fix:
```css
.scroll-container { overflow: auto; min-width: 0; max-width: 100%; }
```
Same fix applies to grid items (`1fr` = `minmax(auto, 1fr)` — auto minimum forces the track wider).

### `auto-fill` / `auto-fit` floor
`repeat(auto-fill, minmax(280px, 1fr))` overflows below 280px. Wrap the floor:
```css
grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
```

### Native `<input>` intrinsic width
Bare `<input type="text">` has ~200px intrinsic width. In a flex row alongside icon buttons, it pushes the row past the viewport. Fix:
```css
.chat-input input { flex: 1; min-width: 0; }
```
Same applies to `<select>` and `<textarea>`.

### `.btn { min-width: 140px }` on narrow viewports
Two side-by-side buttons (140 + gap + 140 = 292px+) don't fit a 288px mobile content area. Two fixes, apply both:
1. `flex-wrap: wrap` on action containers (`.modal-actions`, `.permission-actions`, etc.)
2. Drop the floor at ≤480px: `@media (max-width: 480px) { .btn { min-width: 0; } }`

### Tab rows scroll, never wrap
Wrapping tabs looks broken. Scroll horizontally:
```css
.tabs { display: flex; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.tab { flex-shrink: 0; white-space: nowrap; }
```

### Fixed-positioned floats need viewport-aware max-widths
A toast with `right: 24px; max-width: 360px` extends off-screen left below ~408px. Cap with viewport math:
```css
.toast-stack { right: var(--space-5); max-width: min(360px, calc(100vw - var(--space-5) * 2)); }
.popover { min-width: 220px; max-width: calc(100vw - var(--space-5) * 2); }
```

## Anti-patterns
- Disable browser zoom · hover-only critical information · touch targets under 44×44
- Auto-focus inputs on mobile · `type="number"` for IDs/phone/ZIP/credit card
- Input font-size below 16px on iOS
- Tables that horizontally overflow without scroll · flex item w/ overflow but no `min-width: 0`
- `max-width` media queries as primary strategy · tabs that wrap instead of scroll
- Skip safe-area-inset on full-screen layouts · build mobile as an afterthought

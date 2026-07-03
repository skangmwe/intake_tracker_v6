---
name: McDermott Responsive & Mobile
description: 'Use when designing or building ANY component for the McDermott design system. Mobile responsiveness is a non-negotiable requirement for every component, layout, and surface — not an optional add-on. Always load this skill alongside any component-building task. Triggers on responsive layouts, mobile-first CSS, breakpoints, touch targets, mobile navigation, gestures, viewport handling, mobile keyboards, hover-on-touch fallbacks, cross-device behavior, or any UI work whatsoever.'
version: 2.0.0
---
# McDermott Responsive & Mobile

## **Mandate: Every component is responsive. No exceptions.**

Mobile responsiveness is not a phase, an add-on, or a "we'll get to it." Every component built for McDermott — buttons, cards, charts, tables, AI surfaces, headers, steppers, modals, **everything** — must work elegantly from a 320px phone viewport to a 1920px+ desktop. If a component doesn't pass the responsive checklist below, it's not done.

This skill loads alongside every component-building task. The rules here apply to anything you build in McDermott.

## **Mobile design is editing, not scaling.**

The single most common mobile failure: treating mobile as a *scaled-down version* of desktop. It never works. Desktop layouts have density assumptions baked in — multi-column grids, side-by-side controls, persistent navigation, status indicators with room to breathe — that all break when uniformly compressed. Scaling proportionally just gives you a cramped desktop, not a working mobile experience.

**The fix is editing, not scaling.** When adapting any desktop layout to a narrow viewport, every element gets one of five treatments:

1. **Keep** — the element fits and earns its space at every viewport. (Rare for non-essential content.)
2. **Remove** — duplicative breadcrumb segments, decorative status text, secondary action buttons that "could" be there but earn no information at small widths. Cut them.
3. **Move** — sidebar collapses to drawer, computed values relocate from top bar to a contextual card, multi-column grid becomes single column. Same information, different place.
4. **Reshape** — full text labels become icons (with tooltip-on-tap), pop-up dropdowns become bottom sheets, side-by-side stacks vertically, comfortable density becomes compact, horizontal pill rows become single-column lists.
5. **Replace** — autosave-as-sentence becomes a `cloud-check` icon; hover-only affordances become tap-revealed sheets; multi-step wizard becomes a single-step-with-progress-bar.

**What you almost never do:** shrink the existing layout uniformly. That gives you cramped buttons, unreadable text, and word-by-word wrapping headers — visible symptoms of the "scaling" fallacy.

**The mobile audit question** to apply to every desktop layout: for each element, decide — *keep, remove, move, reshape, or replace?* If your only answer is "keep," the mobile layout is overloaded and the responsive bug is already in the design. The work is editorial: cut what's redundant, relocate what's misplaced, reshape what doesn't fit.

This is why a "responsive" component isn't just a CSS exercise — it's a design decision at the layout level. The CSS rules in this file (constraint cascades, flex `min-width: 0`, the overflow patterns) are what make the editing *possible*. They're not the editing itself.

## The non-negotiable responsive checklist

Every component must pass before shipping:

- [ ] **Works at 320px viewport width** — the narrowest viewport we support. No horizontal page scroll.
- [ ] **Touch targets ≥ 24×24px** (WCAG 2.2 AA floor; ≥44×44 preferred for primary actions)
- [ ] **No fixed pixel widths** that exceed 320px without an explicit overflow strategy (scroll, wrap, ellipsis, or hide)
- [ ] **Flex/grid items have `min-width: 0`** if they contain potentially-overflowing content
- [ ] **Long unbroken strings** wrap via `overflow-wrap: break-word` (URLs, file paths, citations)
- [ ] **Header content doesn't wrap word-by-word** — if it doesn't fit, use the collapse priority from `app-shell-and-headers.md`
- [ ] **Tested in both light AND dark theme** at narrow viewport
- [ ] **Sticky positioning still works** (no `overflow-x: hidden` on body — use `overflow-x: clip` on html)
- [ ] **Hover-only affordances have a touch equivalent** (touch UAs don't have hover)
- [ ] **No `user-scalable=no`** in viewport meta (a11y violation)

Cross-device behavior. Pairs with `McDermott Design System` (breakpoint tokens) and `McDermott Navigation & IA` (mobile nav patterns).
## Breakpoints
| Token | Width | Typical use |
|---|---|---|
| `--bp-sm` | 640px | Larger phones, small tablets in portrait |
| `--bp-md` | 768px | Tablets, condensed desktop |
| `--bp-lg` | 1024px | Desktop, sidebar appears |
| `--bp-xl` | 1280px | Wide desktop, multi-column dashboards |
| `--bp-2xl` | 1536px | Wide displays, max content widths apply |

Mobile-first: write base styles for the smallest viewport, layer up via `@media (min-width)`. Never `max-width` queries except for explicit mobile-only overrides.
## Touch targets
- Minimum **44×44px** (iOS) / **48×48dp** (Android). Apply to every interactive element on touch surfaces.
- At least **8px** spacing between adjacent targets.
- Visual size can be smaller than the touch target — pad the click area with transparent space.
## Hover doesn't exist on touch
Every hover state needs an equivalent press/active state. Never put critical info in a hover-only tooltip — touch and keyboard users will miss it.
- Replace hover-reveal with: persistent display (mobile), explicit click/tap to open, or long-press (last resort).
- For desktop hover affordances that aren't critical, treat them as enhancement only.
## Layout patterns
- **Sidebar** collapses to a drawer below `--bp-lg` (1024px). See `McDermott Navigation & IA`.
- **Multi-column** collapses to single-column below `--bp-md` (768px).
- **Tables** become **stacked cards** on mobile (each row becomes a card with label-value pairs), or get horizontal scroll with a sticky first column.
- **Forms** stay single-column at every breakpoint (best practice regardless of width).
## Mobile navigation
See `McDermott Navigation & IA` for full decision matrix. Quick reference:
- Bottom tab bar for ≤5 primary destinations.
- Drawer (hamburger) for secondary destinations.
- Top bar for app branding + search + notifications.
- Bottom tabs hide on scroll-down, return on scroll-up.
## Mobile-specific patterns
- **Pull-to-refresh** — for primary feed/list screens. Use Phosphor `arrow-clockwise` rotating.
- **Swipe actions** on list items — secondary actions (archive, delete) revealed by swipe. Always also expose via tap menu.
- **Bottom sheet** instead of modal — preserves context. See `McDermott Disclosure Surfaces`.
- **Long-press** — disclose contextual actions. Always also offer a visible alternative.
## Mobile keyboard handling
- Use `inputmode` to surface the right mobile keyboard:
  - `inputmode="numeric"` for number-only fields
  - `inputmode="email"` for email
  - `inputmode="tel"` for phone
  - `inputmode="url"` for URLs
  - `inputmode="search"` for search
  - `inputmode="decimal"` for currency
- Use `autocomplete` attributes (`given-name`, `email`, `current-password`, `one-time-code`) so password managers and autofill work.
- Use `enterkeyhint` to label the Enter key (`enterkeyhint="search"`, `"send"`, `"done"`).
- Don't disable autofill or paste — it breaks password managers and accessibility.
- Avoid `autofocus` on page load — causes viewport jump on mobile.
- The viewport zooms in if input font-size is < 16px on iOS — set inputs to ≥ 16px or set `viewport` `maximum-scale`.
## Viewport meta
Always include:
```html
<meta name="viewport" content="width=device-width, initial-scale=1">
```
Never set `maximum-scale` or `user-scalable=no` — disabling zoom is an accessibility violation.
## Safe areas (notched devices)
Use `env()` for safe-area insets on full-screen content:
```css
padding-bottom: max(var(--space-4), env(safe-area-inset-bottom));
```
Apply to bottom tab bars, fixed buttons, and any content that touches the bottom edge.
## Performance budgets (mobile)
- LCP (Largest Contentful Paint): ≤ 2.5s on 4G
- CLS (Cumulative Layout Shift): ≤ 0.1
- Total page weight: ≤ 1MB on initial load (mobile)
- Defer non-critical CSS and JS
- Use `loading="lazy"` on images below the fold
## Reduced motion
- Respect `prefers-reduced-motion: reduce` on every animation.
- Mobile users in transit may also have motion sickness — keep this stricter than desktop.
- Replace movement with opacity-only transitions.
- See `_core-requirements.md` ('Adding motion') for when motion is appropriate and how to add it.
## Testing checklist
Before shipping any responsive surface:
- [ ] Test at each breakpoint (320, 375, 768, 1024, 1280, 1920)
- [ ] Test in both portrait and landscape on mobile
- [ ] Test with mobile keyboard open (does the layout collapse correctly?)
- [ ] Tap-test every interactive element with thumb (44×44 minimum)
- [ ] Test on slow connection (Chrome DevTools throttle to "Slow 3G")
- [ ] Verify safe-area handling on notched devices
- [ ] Verify zoom works (no `user-scalable=no`)
## McDermott-specific
- Use `--space-*` tokens — they're consistent across breakpoints unless explicitly overridden.
- The McDermott sidebar (`--sidebar-w: 260px`) collapses below `--bp-lg`. Above, persistent.
- The McDermott button minimum (140×36px) needs additional padding on touch surfaces to reach 44×44 — wrap in a container with extra hit area.
## The full overflow-cascade pattern
A single overflowing element (a wide table, a long string, a fixed-width image) will push every ancestor in its tree wider than the viewport unless the ancestors are explicitly constrained. Setting `overflow-x: hidden` on `body` alone isn't enough — `body` clips its own children but the `html` element can still scroll, hiding the bug behind a visible-but-clipped layout where content silently disappears off the right edge.

**The lockdown pattern for any responsive page:**
```css
html, body {
  max-width: 100vw;
  overflow-x: hidden;
}
/* Every major layout container also explicitly constrained */
.app          { max-width: 100vw; }
main          { max-width: 100%; min-width: 0; }
section       { max-width: 100%; min-width: 0; }
.row, .stack  { max-width: 100%; min-width: 0; }
```

With this in place, any descendant that wants to be wider than its parent has to opt into its own scroll behavior (e.g., a table with `overflow-x: auto` on its wrapper). Without it, a single 900px-wide table buried five levels deep can silently push the entire page wider than the viewport on phones.

## The flex `min-width: auto` gotcha
The single most common flexbox bug: a flex item with overflow content (a wide table, a long string, a horizontal-scroll container) refuses to shrink below the size of its content, pushing the parent wider than the viewport — even when the item has `overflow: auto` or `overflow: hidden`.

**Why it happens:** flex items default to `min-width: auto`, which the CSS spec defines as the item's *minimum content size*. If the content has an explicit width (e.g., a table with `min-width: 900px`), the flex item's "minimum content size" is at least 900px. The flex container then expands to fit it, breaking responsive layout.

**The fix:** `min-width: 0` on the flex item. This tells flex layout "I can be narrower than my content — let the overflow rules handle it from there." Now the item shrinks to whatever the container gives it, and the container's `overflow: auto` properly triggers horizontal scroll.

```css
/* Required for any flex item with horizontal scroll inside */
.scroll-container {
  overflow: auto;
  min-width: 0;       /* CRITICAL: without this, the container pushes the page wider */
  max-width: 100%;    /* belt-and-suspenders */
}
```

The same pattern applies to `min-height: 0` on flex items in column layouts where you want vertical scroll.

## The grid-track `auto` minimum gotcha
Same bug as the flex one above, different syntax. A grid track defined as `1fr` is shorthand for `minmax(auto, 1fr)`. The `auto` minimum equals min-content of the largest item in the track — meaning a single descendant with a hard min-width (a wide table, a fixed-width image, a 200px `<input>`) forces the entire track wider than the viewport. The grid container caps at `100vw` but the track inside can blow past it.

**The fix:** `min-width: 0` on the grid ITEM (not the container).

```css
.app           { display: grid; grid-template-columns: 1fr; max-width: 100vw; }
.app-body      { min-width: 0; max-width: 100%; }   /* the grid item must opt out of auto-min */
```

A symptom: page reports `document.documentElement.scrollWidth` of e.g. 934px regardless of viewport at every width below desktop. That number is the min-content of the widest descendant, propagating up.

## Responsive `auto-fill` / `auto-fit` grids — `min(100%, X)`
A grid with `repeat(auto-fill, minmax(280px, 1fr))` overflows at viewports below 280px. The 280px is a hard floor. Wrap it in `min(100%, X)` so the floor collapses to viewport at narrow widths:

```css
/* Bad — 280px floor forces overflow on narrow phones */
grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));

/* Good — collapses to viewport when viewport < 280 */
grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
```

## Native `<input>` intrinsic width
A bare `<input type="text">` reports an intrinsic width of ~200px (from the default `size` attribute). In a flex row alongside icon buttons, this pushes the row past the viewport unless the input has `min-width: 0`. Same root cause as the flex `min-width: auto` gotcha — applies specifically to inputs, selects, and textareas because they have a non-zero default min-content.

```css
.chat-input input { flex: 1; min-width: 0; }   /* let it shrink with the row */
```

## `.btn { min-width: 140px }` and narrow viewports
The McDermott button minimum of 140×36 holds the look at desktop, but two side-by-side buttons (`140 + gap + 140 = 292px+`) won't fit a typical 288px mobile content area. Two complementary fixes — apply both:

1. **Action containers must wrap.** `flex-wrap: wrap` on every container holding multiple `.btn`s — `.modal-actions`, `.permission-actions`, `.bulk-actions`, `.row` (already does), etc.
2. **Drop the floor at ≤480px.**
   ```css
   @media (max-width: 480px) { .btn { min-width: 0; } }
   ```
   The 14pt label and `white-space: nowrap` still keep the button readable; only the artificial 140px floor goes away.

## Tab rows scroll, they don't wrap
A row of tabs with `white-space: nowrap` on each tab will overflow at narrow widths. **Tabs are a row, always** — wrapping them looks broken. Make the tab container scroll horizontally instead:

```css
.tabs { display: flex; overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; }
.tab  { flex-shrink: 0; white-space: nowrap; }
```

Style the scrollbar thin (`scrollbar-width: thin` / `::-webkit-scrollbar { height: 4px }`) so it reads as overflow indication, not chrome.

## Fixed-positioned floats need viewport-aware max-widths
`position: fixed` elements anchored to one edge (toasts at `bottom-right`, popovers anchored to a trigger) have no automatic relationship with the viewport's other edge. A toast with `right: 24px; max-width: 360px` extends off-screen left at viewports below ~408px. Cap with viewport math:

```css
.toast-stack { right: var(--space-5); max-width: min(360px, calc(100vw - var(--space-5) * 2)); }
.popover     { min-width: 220px; max-width: calc(100vw - var(--space-5) * 2); }
```

## Demo / example divs must use responsive utility classes
Inline `style="font-size: 64px"` on a typography example in a showcase or doc page won't pick up responsive media queries. The 64px display will be wider than a 320px viewport. Always use the system's utility classes (`.display`, `.h1`, `.h2`, ...) — they already carry the responsive scaling.

## Anti-patterns — Never Do This
- Disable browser zoom (`user-scalable=no` or `maximum-scale=1`)
- Hover-only critical information
- Touch targets under 44×44px
- Auto-focus inputs on mobile (causes viewport jump)
- Use `type="number"` for IDs, phone, ZIP, credit card (use `inputmode="numeric"` with `type="text"`)
- Disable paste in form fields
- Build mobile-as-an-afterthought (always design mobile first)
- Use `max-width` media queries as the primary responsive strategy (mobile-first uses `min-width`)
- Show bottom tab bar AND drawer AND top bar on mobile (pick a primary)
- Set input font-size below 16px on iOS (forces zoom-in on focus)
- Skip safe-area-inset on full-screen layouts
- Tables that horizontally overflow without a scroll affordance
- Flex item with overflow content but no `min-width: 0` — the item won't shrink below its content size, pushing the parent past the viewport silently (see "The flex `min-width: auto` gotcha" above). The most common cause of "the page won't stop horizontally scrolling and I can't figure out why."
- Grid item without `min-width: 0` when the grid track is `1fr` — same bug as flex, same symptom (page minimum width = min-content of the widest descendant). See "The grid-track `auto` minimum gotcha."
- `repeat(auto-fill/auto-fit, minmax(280px, 1fr))` with no `min(100%, …)` floor — the 280px is a hard minimum and pushes the page wider than tiny viewports.
- `<input type="text">` in a flex row without `min-width: 0` — the input's ~200px intrinsic width forces the parent flex container past the viewport.
- Action button row with `display: flex` but no `flex-wrap: wrap` — two `.btn`s at 140px min-width each won't fit a phone content area side-by-side. The second button gets cut off the right edge.
- Tabs row that wraps to multiple lines instead of scrolling horizontally — wrapping tabs is broken UX. Use `overflow-x: auto` on `.tabs` and `flex-shrink: 0` on each `.tab`.
- Fixed-positioned floating UI (toast, popover) without a `max-width: calc(100vw - X)` cap — at narrow viewports the float extends past the opposite edge.
- Inline-style `font-size: 64px` (or any large fixed size) in a typography example or demo — responsive scaling lives on `.display`, `.h1`, etc. utility classes; inline styles bypass it.

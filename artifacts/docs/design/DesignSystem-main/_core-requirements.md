# McDermott Design System

**Version 1.4** · A navy + pale + accent visual system for building beautiful, consistent, enterprise-grade web applications. Saturated colors are targeted spice, not default tools. Every value is a CSS custom property — never hardcoded.

## **Mandate: Every component is mobile-responsive. No exceptions.**

Mobile responsiveness is a first-class requirement, not an add-on. Every component must work at viewports from 320px to 1920px+ in both light and dark theme. The responsive checklist (see `responsive-and-mobile.md`) is a gate, not a guideline. If a generation doesn't pass it on a 320px viewport, it's not done.

**Foundational principle: mobile design is editing, not scaling.** When adapting a desktop layout to mobile, every element gets one of five treatments — keep, remove, move, reshape, or replace. Uniformly shrinking the desktop layout doesn't produce a mobile experience; it produces a cramped desktop. The work is editorial: cut what's redundant, relocate what's misplaced, reshape what doesn't fit. See `responsive-and-mobile.md` for the full principle and `extrapolating-the-system.md` for how it applies when building new components.

## When generating components not directly speced

Read `extrapolating-the-system.md` for the playbook on building components the system doesn't explicitly cover. Key principle: **build by composition from existing tokens, never invention.** When the spec doesn't directly tell you what to do, default to `--bg-surface` background, 1px `--border-light` border, 2px radius, `--space-4`/`--space-5` padding, `--text-primary` body text, and `--accent-interactive` for any interactive accent. Run the "subtlety test" — if it feels visually loud, it's wrong. Match the showcase before inventing new treatments.

## Brand voice & attributes

Precise. Warm. Confident. Never cute. Editorial in headlines, neutral in UI.

- No exclamation marks in errors or warnings
- No "Oops!", "Whoops!", "Just", "Simply"
- Headlines in sentence case (never title case)
- Buttons use verb + noun ("Save changes", not "Submit")
- Error messages: what happened + (if known) why + how to fix

## Critical rules (memorize these — they govern everything)

### 1. Theme-stable foreground rule
Text on pale fills (`--color-pale-*`) and alert fills (`--color-error`, `--color-success`, `--color-warning`) is **always navy** — never `var(--text-primary)`. The pale and alert tokens don't shift between themes, but `--text-primary` does. Mixing them produces white-on-pale or navy-on-navy depending on theme.

### 2. `var(--color-teal)` vs `var(--accent-interactive)`
`--color-teal` direct usage is restricted to **only two cases**:
- Sidebar active state (sidebar is navy in both themes; teal contrasts on dark)
- Categorical data viz when teal is one of multiple chart series

**Everything else interactive uses `var(--accent-interactive)`** — blue in light, teal in dark. This includes primary buttons, AI surfaces (sparkle/cursor/thinking-dots), focus rings, selected states on checkboxes/radios/toggles, active tabs and link hovers, single-series chart fills, interactive borders.

### 3. Border radius
2px (`--radius`) for everything except pills (`--radius-pill: 999px`). Anything in between is wrong.

### 4. Buttons never wrap
`.btn { white-space: nowrap }`. Keep labels short enough to fit on one line.

### 5. Hover convention
Clickable text-bearing elements (links, nav, content titles, chips, follow-ups) flip **both border accent AND text color** to `var(--accent-interactive)` on hover. Border-only is the broken state. **Solid button variants fill on hover instead** (Secondary → navy fill light / teal fill dark — see the button table); this flip does not govern them.

### 6. WCAG 2.2 AA is the floor
Touch targets ≥ 24×24. Focus rings always visible. Color never the sole indicator of state. Semantic HTML before ARIA.

## Color palette

All colors as CSS custom properties on `:root`. Never hardcode hex.

### Primary
| Token | Hex | Notes |
|---|---|---|
| `--color-navy` | `#000042` | Primary text on light, sidebar bg, scrim tint |
| `--color-blue` | `#0018F2` | Light-mode interactive accent |
| `--color-white` | `#FFFFFF` | Surfaces on light theme |

### Secondary
| Token | Hex |
|---|---|
| `--color-magenta` | `#F48DFF` |
| `--color-orange` | `#FC561D` |
| `--color-gold` | `#E5AC2E` |

### Highlights
| Token | Hex | Notes |
|---|---|---|
| `--color-teal` | `#00E2C1` | Dark-mode interactive accent, brand highlight |
| `--color-neon` | `#D2FF3E` | **Use sparingly** — max-attention moments only |

### Pale backgrounds (theme-stable — pair with navy text)
| Token | Hex |
|---|---|
| `--color-pale-blue` | `#E2E8FF` |
| `--color-pale-magenta` | `#FFEDFF` |
| `--color-pale-orange` | `#FFE2DE` |
| `--color-pale-gold` | `#F9E9D2` |
| `--color-pale-success` | `#DCF1D2` |

### Alerts (background fills only — text on alerts must be navy)
| Token | Hex |
|---|---|
| `--color-error` | `#FF3333` |
| `--color-success` | `#75D957` |
| `--color-warning` | `#F1E53C` |

### Internal-only utility grays (never in client-facing UI)
| Token | Hex |
|---|---|
| `--color-navy-gray-1` | `#EBEBF2` |
| `--color-navy-gray-2` | `#DEDEE5` |
| `--color-navy-gray-3` | `#D2D2D9` |

### Theme tokens (flip per `[data-theme]`)
| Purpose | Light | Dark |
|---|---|---|
| `--bg-page` | `#F7F7FC` | `#13134E` |
| `--bg-surface` | `#FFFFFF` | `#1C1C66` |
| `--bg-sidebar` | navy | `#0D0D46` |
| `--text-primary` | navy | white |
| `--text-secondary` | `rgba(0,0,66,0.65)` | `rgba(255,255,255,0.7)` |
| `--accent-interactive` | blue | teal |
| `--icon-default` | navy | teal |
| `--border-light` | `#E5E5EE` | `#2C2C80` |
| `--border-button` | `#D9D9D9` | `#4D4DA8` |
| `--focus-ring` | blue | teal |
| `--scrim` | `rgba(0,0,66,0.5)` | `rgba(0,0,0,0.6)` |

## Typography

System fonts only. No web fonts.

| Token | Stack | Use |
|---|---|---|
| `--font-sans` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif` | Body, UI, buttons, tables & data |
| `--font-mix` | `Georgia, 'Times New Roman', serif` | Navigation, display headings, card titles — never tables/data |
| `--font-serif` | `Georgia, serif` | Editorial content |

### Type scale
| Element | Font | Size | Line-height | Letter-spacing |
|---|---|---|---|---|
| Display | Mix | 64pt | 0.95 | -4% |
| H1 | Mix | 44pt | 1.05 | -3% |
| H2 | Mix | 32pt | 1.1 | -2% |
| H3 | Mix | 24pt | 1.2 | normal |
| Body Large | Sans Light | 20pt | 1.4 | normal |
| Body | Sans | 16pt | 1.5 | normal |
| Eyebrow | Sans Light | 13pt | normal | ALL CAPS, 10% |
| Caption | Sans | 13pt | normal | normal |

Display drops to 44pt at ≤768px, 32pt at ≤480px (with `word-break: break-word`).

### Capitalization
- Eyebrows / labels → ALL CAPS
- Buttons → ALL CAPS
- Headlines / page titles → Sentence case (never Title Case)
- Proper nouns → Title Case
- Everything else → Sentence case

## Spacing scale

4px base. Every margin and padding references a token. No arbitrary values.

```
--space-1: 4px    --space-2: 8px    --space-3: 12px   --space-4: 16px
--space-5: 24px   --space-6: 32px   --space-7: 48px   --space-8: 64px   --space-9: 96px
```

Vertical rhythm: `--space-4` between siblings within a section, `--space-6` between sections, `--space-8` between major page regions.

## Breakpoints

```
--bp-sm: 640px    --bp-md: 768px    --bp-lg: 1024px    --bp-xl: 1280px    --bp-2xl: 1536px
```

Mobile-first: write base styles for narrowest viewport, layer up via `min-width` queries. Sidebar collapses to a drawer below `--bp-lg`.

## Motion

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | 100ms | Micro-interactions |
| `--duration-base` | 200ms | Default state changes |
| `--duration-slow` | 300ms | Surface transitions (modal, sheet) |
| `--duration-deliberate` | 500ms | Choreographed reveal |
| `--ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | Default |
| `--ease-emphasis` | `cubic-bezier(0.2, 0, 0, 1)` | Entering surfaces |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Leaving surfaces |

Always wrap in `@media (prefers-reduced-motion: reduce)` — disable decorative loops (skeleton, cursor blink, thinking dots) but keep state transitions near-instant. Never `transition: none`.

## Adding motion
Purposeful motion is welcome; gratuitous motion isn't. Two kinds, handled differently:
- **Functional motion** communicates state, causality, or continuity — a drawer sliding from where it came, a stepper advancing, an expand/collapse, a sheet entering. Author it directly with the motion tokens; under reduced-motion it degrades to near-instant (never `transition: none`), so it still reads as a state change.
- **Decorative / expressive motion** — loops, choreographed reveals, attention-pullers. Permitted, but wrap it in `@media (prefers-reduced-motion: no-preference)` so it runs only for users who haven't asked to reduce motion — nothing to strip for those who have.

**How to add one:** use the motion tokens (never hardcode timings); `--duration-deliberate` (500ms) is the choreographed-reveal duration. Functional motion needs no guard. Guard decorative motion behind no-preference:
```css
@media (prefers-reduced-motion: no-preference) {
  .badge-new { animation: pulse var(--duration-deliberate) var(--ease-emphasis) 2; }
}
```
This is the canonical motion rule; the reduced-motion notes elsewhere defer to it.

## Motion & loading craft
Purposeful motion is part of the product, not decoration. Done well it's **felt, not noticed** — it explains where a surface came from, that content is loading, or that a value changed, then gets out of the way. The craft lives in *timing and easing*, not the number of effects: one side sheet on the right curve reads as expensive; five bouncing flourishes read as a toy. McDermott's register is **calm and confident, never playful** — no spring overshoot, bounce, wobble, or confetti.

**Easing & duration.** Entering surfaces use `--ease-emphasis`; leaving uses `--ease-exit`; in-place changes use `--ease-standard`. `--duration-fast` for instant feedback, `--duration-base` for most transitions, `--duration-slow` for surfaces (sheet/modal/drawer), `--duration-deliberate` (500ms) only for a real reveal or count-up. Nothing in UI runs longer than 500ms. Animate `transform` and `opacity` only — never `width`/`height`/`top`/`left` (they jank).

**Orchestration.** Reveal related elements with a short stagger (~40–60ms each, capped at ~6–8 items / ~300ms total) so a screen assembles like it was composed, not popping in at once. One signature motion per surface — don't stack them.

**Loading is a first-class surface.** For data-heavy tools the biggest win is the loading story, not hover effects: skeletons that match the real layout, a skeleton→content crossfade (not a hard swap), optimistic UI, streaming results, and KPI count-up.

**Signature motions** (use these; don't invent per-app):
- **Surface entrance** — sheet/drawer slide + opacity, modal `scale(0.96)→1` + opacity; `--duration-slow` `--ease-emphasis` in, `--ease-exit` out.
- **List / section reveal** — fade + 8px rise, `--duration-base` `--ease-emphasis`, staggered.
- **Skeleton → content** — skeleton fades out as content fades in, `--duration-base` `--ease-standard`; identical layout underneath.
- **KPI count-up** — number eases to its target over `--duration-deliberate` (ease-out), `font-variant-numeric: tabular-nums`.
- **Value-change highlight** — a changed cell/number tints `--color-pale-blue` briefly, then fades over `--duration-slow`.
- **Route / page transition** — outgoing content fades, incoming fades + short rise, `--duration-base`.

**Reduced motion.** All of the above degrade per *Adding motion*: functional motion collapses to near-instant; decorative motion (loops, choreographed reveals) is gated behind `prefers-reduced-motion: no-preference`; count-up snaps to the final value. Live reference: the "Signature motion" demo in the showcase Motion section.

**Anti-patterns.** Spring/overshoot/bounce/wobble physics · confetti or celebratory bursts · a spinner used as brand personality · motion on every element · parallax · UI durations over 500ms · animating layout properties.

## Component states

Every interactive element has these six states:
| State | Treatment |
|---|---|
| Default | Token-defined |
| Hover | Per-component (see Buttons, Links) |
| Focus-visible | 2px outline at `--focus-ring`, 2px offset (3px on buttons) |
| Active / Pressed | One step darker, no movement |
| Disabled | `opacity: 0.4`, `pointer-events: none`, `cursor: not-allowed` |
| Loading | Replace label with spinner, retain dimensions |

Focus rings must always be visible — `outline: none` without a replacement is forbidden.

## Buttons

All buttons: `--font-sans`, ALL CAPS, 14pt, 2px radius, min 140×36px, `white-space: nowrap`.

| Variant | Light | Dark | Hover (light) | Hover (dark) |
|---|---|---|---|---|
| **Primary** | blue bg + white text | teal bg + navy text | navy bg + white text | white bg + navy text |
| **Secondary** | white bg + 1px `--border-button` + navy text | transparent + 1px `--border-button` + white text | navy bg + white text + navy border | teal bg + navy text + teal border |
| **Destructive** | `--color-error` bg + navy text | (same as light) | `#E62929` bg + navy text | (same) |

In-button icons locked to 16px (`.btn i { font-size: 16px }`). Destructive does **not** hover-flip; just darken the red.

## Links

| Variant | Style | Default | Hover |
|---|---|---|---|
| CTA text link | Sans Medium ALL CAPS 16pt + arrow | navy (light) / white (dark) | blue (light) / teal (dark) |
| Hyperlink | Underlined Sans Light 18pt | navy | blue (light) / teal (dark) |
| Content title | Sans Light 18pt no underline | navy | blue (light) / teal (dark) |
| Navigation link | Mix Light 16pt Initial caps | navy | blue (hover), teal (active) |

## Forms

- Single column by default. Two columns only for obviously paired fields.
- Validate on blur (fields) and on submit (forms). **Never** on keystroke.
- **Mark optional, not required** — no asterisks for required.
- Error format: what happened + why + how to fix. Error text is navy on `--color-pale-orange` left-bordered fill — never red text.
- Use `autocomplete` and `inputmode` attrs. Never disable autofill or paste.
- Checkbox/radio fill: `var(--accent-interactive)` (blue light / teal dark). Check mark white in light, navy in dark.
- Toggle on-state: `var(--accent-interactive)`. 44×24 size, 18px thumb.

## Cards

- Optional top stroke (any secondary color, full-width × 30px)
- Optional image area (400×400 @2x) or solid color fill
- Anatomy: eyebrow (Sans Light ALL CAPS 16pt) + title (Mix Regular 38-60pt) + body (Sans Light 20pt)
- `border-radius: var(--radius)` (2px)
- Hover: `translateY(-2px)` + `var(--shadow-md)`

## Icons

- **Source:** Phosphor Icons (`@phosphor-icons/react`)
- **Weight:** Regular only (2px stroke, monoline, no fill)
- **Sizes:** 16 / 20 / 24 / 32 / 48 / 64px (never in between)
- Navy on light, teal on dark (or theme-aware via `var(--icon-default)`)
- Decorative icons paired with text labels: `aria-hidden="true"`
- Icon-only buttons: require `aria-label`
- **Forbidden:** filled or duotone Phosphor variants

## Badges (status pills)

Default to pale fills, **not saturated alert colors**. Pill shape (`--radius-pill`), 12pt ALL CAPS, 5% letter-spacing.

| Status | Background | Text |
|---|---|---|
| Live | `--color-pale-success` | navy (with 6×6 dot in `--color-success`) |
| Pending | `--color-pale-gold` | navy |
| Failed | `--color-pale-orange` | navy |
| Draft | transparent + 1px `--border-light` | `--text-primary` |
| Archived | transparent + 1px `--border-light` | `--text-secondary` |

Never use `--color-navy-gray-*` for badges in client-facing UI.

## Disclosure surfaces — decision matrix

Pick from the **relationship between the content and what the user is doing**.

| Relationship | Use |
|---|---|
| Must act before continuing | **Modal** — blocking, focus-trapped, navy-tinted scrim with 4px blur |
| Related to main view; user might reference both | **Side sheet** (desktop) / **bottom sheet** (mobile) — non-blocking |
| Brief contextual choices anchored to a trigger | **Popover / dropdown** — no scrim, closes on outside click & Escape |
| Part of the page's content flow | **Inline expansion / accordion** |
| Substantial standalone task; back-button-able | **Full page or new route** |

Modals trap focus, close on Escape, restore focus to trigger. Never nest modals.

## Alerts & notifications

Default to subtle pale fills. Saturated alert colors are reserved for explicit emphasis.

| Severity | Background | Border accent | Text | Icon |
|---|---|---|---|---|
| Info | `--color-pale-blue` | `--color-blue` | navy | `info` |
| Success | `--color-pale-success` | `--color-success` | navy | `check-circle` |
| Warning | `--color-pale-gold` | `--color-warning` | navy | `warning-circle` |
| Error | `--color-pale-orange` | `--color-error` | navy | `x-circle` |

Toasts: bottom-right, max 3 stacked, auto-dismiss in 5s for info/success, **never auto-dismiss errors**.

## Empty states

Three flavors with different ceremony:
- **Zero-data (first run):** pale background, large icon/illustration, primary CTA
- **Filtered-to-zero:** `var(--bg-surface)` + 1px border (theme-aware), no illustration, secondary CTA "Clear filters" — **never use a pale fill here**
- **No-access:** explain who grants access, "Request access" CTA if applicable

## Loading states

| Time elapsed | Treatment |
|---|---|
| < 100ms | Show nothing |
| 100–500ms | Subtle skeleton |
| 500ms – 3s | Skeleton with progressive content reveal |
| 3s – 10s | "Working on it…" + Stop/cancel option |
| > 10s | Progress % + ETA if possible |

Skeleton: theme-aware tones via `--skeleton-base` / `--skeleton-pulse` — pulse animation between them. Never pulse light grays in dark mode.

## Navigation

- Below `--bp-lg` (1024px): persistent sidebar collapses to a slide-in drawer (left, max 320px, with scrim, focus-trap, close on link click)
- Hamburger button (`ph-list` icon) visible only below 1024px — use compound selector `.btn.hamburger-btn` to win CSS specificity
- Active state in **two ways** (color + weight, or color + left rail) — never color alone
- Bottom tabs for ≤5 mobile destinations, drawer for everything else

## Application lockup & naming

Every app shares one identity: the **McDermott symbol + a thin vertical divider + the application name**. No bespoke per-app logos. The divider is the master-brand cue — never omit it in UI. Full spec, anatomy, and naming convention in `application-lockup.md`.

- **Symbol:** the official McDermott vector below — an "M" inside a circle. Paste this **exact** SVG inline; size it via its container and let `fill="currentColor"` color it. It is a graphic mark, **never the letters "McDermott" set in type**. 32px in a sidebar header or top bar; 48–64px on login/splash. Never recolor, crop, or substitute it.

```html
<svg viewBox="0 0 171.84 171.84" xmlns="http://www.w3.org/2000/svg" fill="currentColor" role="img" aria-label="McDermott"><path d="M43,85.12l22.6,36.87h-22.6v-36.87ZM113.34,121.9h16.81V47.95h-16.81v73.95ZM42.17,47.95l47.09,76.79,8.38-20.04-34.79-56.75h-20.67ZM171.84,85.92c0,47.37-38.55,85.92-85.92,85.92S0,133.29,0,85.92,38.55,0,85.92,0s85.92,38.55,85.92,85.92ZM162.77,85.92c0-42.37-34.47-76.85-76.85-76.85S9.07,43.55,9.07,85.92s34.47,76.85,76.85,76.85,76.85-34.47,76.85-76.85Z"/></svg>
```
- **Divider:** 1px, min 24px tall, `color-mix(in srgb, currentColor 22%, transparent)`.
- **Name:** `--font-mix` (Georgia), Title Case, regular weight, 18px in headers, wraps to two lines max.
- **Color by surface:** navy sidebar → white (both themes); light surfaces → `--text-primary`. Never white-on-light or navy-on-navy.
- **Placement (in priority):** sidebar header (primary) → leading position of the top bar when there's no sidebar → centered on login/splash. Appears once per surface — don't repeat it in the top bar when the sidebar already shows it.
- **Responsive:** collapsed sidebar (72px) or ≤360px shows the symbol only — hide the divider and name.
- **Naming:** descriptive, plain real words, domain/object first then function ("Deposition Summarizer"). Avoid bare function words ("Indexer"). Title Case, ~2–4 words, fits two lines.

## Tables (the workhorse — get this right)

- Wrap in `.table-shell` with `overflow-x: auto` AND set `min-width` on the `<table>` (typically 720–960px) — without the min-width, columns compress and the scroll never triggers
- Sticky `<thead>` by default
- Sortable headers: `aria-sort` attribute, `caret-up`/`caret-down` indicator, click cycles asc → desc → cleared
- Global search above the table; per-column filter for categorical columns
- Row selection: leftmost checkbox column + select-all. When ≥1 selected, toolbar transforms into bulk-actions bar
- Row actions: rightmost column with `dots-three-vertical` kebab → popover menu
- Pagination attached to bottom of table-shell (no gap)
- Horizontal scroll fade indicators via the pure-CSS scroll-shadow technique (paired masks + shadow gradients with `background-attachment: local`)
- Filtered-to-zero: single row spanning all columns with subtle "no matches" text + "Clear filters"

## AI surfaces

- **Citations are mandatory** for factual claims. Inline numeric markers (¹) for short responses; sidebar source list for long. Never present unsourced claims as sourced.
- **Confidence is linguistic** ("may", "likely") — never numeric percentages.
- **AI content visually distinct** — `ph-sparkle` icon + "Generated" label (small, in `--accent-interactive`). Never blend silently with human content.
- **Streaming:** token-by-token with 4px `--accent-interactive` cursor (1s blink). Stop button replaces Send during generation (same position).
- **Thinking indicators:** 3 pulsing dots in `--accent-interactive` for waits 2s+. Never generic "Loading…".
- **Tool calls:** every call shown as a collapsed row (icon + tool name + summary + status). Click to expand.
- **Permission prompts for destructive/external actions** — name the specific consequence ("Send email to jordan@..."), not generic "Confirm". Never auto-execute.
- **Feedback** (thumbs up/down): never modal, never blocks next interaction. Down-vote records first, asks for category second.
- **Empty state with 3–5 suggested prompt chips** — representative of common use cases, not full capability list.

## Accessibility — WCAG 2.2 AA floor

- Contrast: 4.5:1 body text, 3:1 large text and non-text UI
- ARIA last resort — prefer semantic HTML (`<button>` not `<div role="button">`)
- `aria-hidden="true"` on decorative icons paired with text labels
- `aria-label` on icon-only buttons
- `aria-sort` on sortable table headers; `aria-selected` on selected rows
- Keyboard nav: Tab through everything, Enter/Space to activate, arrow keys for tablist/menu, Escape to close overlays
- Focus trap inside modals and sheets; restore focus to trigger on close
- Touch targets ≥ 24×24
- Respect `prefers-reduced-motion`
- Never `outline: none` without a visible replacement
- Color cannot be the sole indicator of state

## Responsive — known gotchas

**The flex `min-width: auto` gotcha:** flex items default to a min-width equal to their content's intrinsic size. A flex item containing a 900px-wide table refuses to shrink below 900px, pushing the parent past the viewport. Always set `min-width: 0` on flex items that contain potentially-overflowing content.

**The overflow cascade:** `body { overflow-x: hidden }` makes body a scroll container, which breaks position: sticky on its descendants. Use `overflow-x: clip` on `html` (not body). Body should not have overflow set.

**Constraint cascade pattern:**
```css
html { overflow-x: clip; max-width: 100vw; }
body { max-width: 100vw; }
.app { max-width: 100vw; min-width: 0; }
main { max-width: min(100%, 1200px); min-width: 0; }
section { max-width: 100%; min-width: 0; }
```

**Grid items in narrow viewports:** `repeat(auto-fill, minmax(280px, 1fr))` overflows below 280px viewport. Wrap as `minmax(min(100%, 280px), 1fr)` for safety.

## Anti-patterns — Never do this

- Hardcode hex colors instead of using CSS variables
- Use `var(--color-teal)` directly for anything other than sidebar active state or categorical chart series
- Apply alert colors to text — they're background fills only; text on alerts is always navy
- Mix `--text-primary` with a pale or alert background (white-text-on-pale-blue in dark mode)
- Use `--color-navy-gray-*` in client-facing UI — internal only
- Render the app identity by typing the letters "McDermott" in type — it must be the inline symbol SVG (the M-in-circle mark), never text
- Omit the divider, recolor/crop the symbol, or substitute a bespoke per-app logo
- Border radius between 2px and 999px
- Buttons that wrap (`white-space: normal`)
- Title Case headlines (use sentence case)
- "OK" / "Yes" / "No" / "Submit" as button labels (use verb + noun)
- Exclamation marks in errors, "Oops!", "Just"
- Asterisks (*) for required fields — mark optional instead
- Placeholder text as the only label
- `outline: none` without a visible focus replacement
- Color as the sole indicator of state
- Filled or duotone Phosphor icon variants
- Pie charts with > 5 slices, 3D charts, dual-axis charts
- Wrap a table in `overflow-x: auto` without setting `min-width` on the table itself
- `body { overflow-x: hidden }` (breaks sticky positioning — use `overflow-x: clip` on html)
- Flex item containing overflow content without `min-width: 0`
- Auto-execute destructive AI actions (email, delete, post) without explicit user approval
- Numeric confidence scores on AI output
- Modal feedback prompts that block the user's next interaction
- Pale fill for filtered-to-zero empty states (use `--bg-surface` + border)
- Generic spinner for AI generation (use thinking dots)
- Generic "Error" message with no recovery action

---

**Reference implementation:** `mws-design-system-showcase.html` in this directory. Every rule above is demonstrated there in both light and dark mode with working interactions. When in doubt about how a pattern should look or behave, refer to the showcase before generating new code.

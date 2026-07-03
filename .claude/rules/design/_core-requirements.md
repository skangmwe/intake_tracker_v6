# McDermott Design System

**Version 1.4** · A navy + pale + accent visual system for enterprise-grade web applications. Saturated colors are targeted spice, not default tools. Every value is a CSS custom property — never hardcoded.

This file is the **constitution**: tokens, critical rules, and the index to the deep specs. Detail for each surface lives in its companion file (see index below). When generating, the pipeline must load _core-requirements.md plus the relevant companion(s).

## Mandate: every component is mobile-responsive. No exceptions.

Every component must work at viewports from 320px to 1920px+ in both light and dark theme. Mobile design is **editing, not scaling** — keep, remove, move, reshape, or replace each element. Uniformly shrinking the desktop layout produces a cramped desktop, not a mobile experience. Full principle and 320px gate checklist in `responsive-and-mobile.md`.

## Critical rules (these govern everything)

1. **Theme-stable foreground rule.** Text on pale fills (`--color-pale-*`) and alert fills (`--color-error|success|warning`) is **always navy** — never `var(--text-primary)`. Pale and alert tokens don't shift between themes; `--text-primary` does. Mixing them produces white-on-pale or navy-on-navy depending on theme.
2. **`var(--color-teal)` direct usage is restricted** to sidebar active state and categorical chart series only. Every other interactive accent uses `var(--accent-interactive)` (blue light / teal dark) — primary buttons, AI surfaces, focus rings, selected states, active tabs, single-series chart fills.
3. **Border radius is 2px** (`--radius`) or full pill (`--radius-pill: 999px`). Nothing in between.
4. **Buttons never wrap** (`white-space: nowrap`). Keep labels short.
5. **Hover flips both border AND text** to `var(--accent-interactive)` on **links and quiet text-bearing controls** (links, nav, content titles, chips, follow-ups, ghost/icon buttons) — border-only is the broken state. **Solid button variants fill on hover instead** (Secondary → navy fill + white text light / teal fill + navy text dark; Primary and Destructive per variant); this flip does not govern them.
6. **WCAG 2.2 AA is the floor.** Touch targets ≥ 24×24. Focus rings always visible. Color is never the sole indicator of state. Semantic HTML before ARIA.

> **Enforced, not just advised.** These are checked by deterministic gates so they can't be silently skipped:
> - `/dev-build-architecture` runs `.claude/hooks/detect-design-handoff.sh` — recording "no design handoff" while a bundle exists is a hard error.
> - `/dev-review-and-remediate` runs `.claude/hooks/check-design-conformance.sh --web-required` — raw colours (hex, `rgb()`/`hsl()`/`oklch()`/…, named CSS colours) and off-spec radii (rules 2 & 3 above) in component styles (`.css`/`.scss` and inline/CSS-in-JS in `.tsx`/`.jsx`) are a **blocking** finding. Tokens only; no "close enough" values. The hook self-locates the worktree and FAILs (not skips) if it cannot scan while web is in scope — a SKIP is never a pass.
> - `/dev-review-and-remediate` runs the **design fidelity render & compare** against the **prototype** when a design handoff is present (driven by `.claude/hooks/enumerate-blueprint-screens.sh` + `.claude/skills/dev-review-and-remediate/design-fidelity-web.md`) — for every prototyped screen it renders the prototype and the build side by side and compares them; any visual difference (`visual-drift` / `missing-element` / `added-element` / `not-implemented` / `style-inconsistent` / `content-drift`) is a **blocking** finding, and a present handoff with no prototype bundle is itself blocking. Token discipline checks the property level; this checks whether the built screen looks like the prototype.

## Brand voice

Precise. Warm. Confident. Never cute. Editorial in headlines, neutral in UI. Headlines in sentence case; buttons use verb + noun. No exclamation marks in errors. No "Oops!", "Just", "Simply". Error message formula, banned words, capitalization, and full voice rules: `ux-copy-and-microcopy.md` (canonical).

## Application lockup & naming

Every app shares one identity — the **McDermott symbol + a thin vertical divider + the application name** — never a bespoke per-app logo. The symbol is the official vector below — an "M" inside a circle. Paste this **exact** SVG inline; `fill="currentColor"` lets one mark serve every surface and theme. It is a graphic mark, **never the letters "McDermott" set in type**. The divider is the master-brand cue and is never omitted in UI. The name is set in `--font-mix` (Georgia), Title Case, regular weight, and wraps to two lines max. It lives in the sidebar header (primary), the leading top-bar slot when there's no sidebar, or centered on login/splash — once per surface, white on the navy sidebar in both themes. **Naming convention:** descriptive plain words, domain/object first then function ("Deposition Summarizer"); avoid bare function words ("Indexer") that collide at scale; Title Case, ~2–4 words. Full spec, color-by-surface, and responsive behavior: `application-lockup.md` (canonical).

```html
<svg viewBox="0 0 171.84 171.84" xmlns="http://www.w3.org/2000/svg" fill="currentColor" role="img" aria-label="McDermott"><path d="M43,85.12l22.6,36.87h-22.6v-36.87ZM113.34,121.9h16.81V47.95h-16.81v73.95ZM42.17,47.95l47.09,76.79,8.38-20.04-34.79-56.75h-20.67ZM171.84,85.92c0,47.37-38.55,85.92-85.92,85.92S0,133.29,0,85.92,38.55,0,85.92,0s85.92,38.55,85.92,85.92ZM162.77,85.92c0-42.37-34.47-76.85-76.85-76.85S9.07,43.55,9.07,85.92s34.47,76.85,76.85,76.85,76.85-34.47,76.85-76.85Z"/></svg>
```

## Color palette

All colors as CSS custom properties on `:root`. Never hardcode hex.

### Primary
| Token | Hex |
|---|---|
| `--color-navy` | `#000042` |
| `--color-blue` | `#0018F2` |
| `--color-white` | `#FFFFFF` |

### Secondary
`--color-magenta` `#F48DFF` · `--color-orange` `#FC561D` · `--color-gold` `#E5AC2E`

### Highlights
`--color-teal` `#00E2C1` (dark-mode accent) · `--color-neon` `#D2FF3E` (max-attention moments only)

### Pale backgrounds — theme-stable, pair with navy text
`--color-pale-blue` `#E2E8FF` · `--color-pale-magenta` `#FFEDFF` · `--color-pale-orange` `#FFE2DE` · `--color-pale-gold` `#F9E9D2` · `--color-pale-success` `#DCF1D2`

### Alerts — background fills only, text always navy
`--color-error` `#FF3333` · `--color-success` `#75D957` · `--color-warning` `#F1E53C`

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

Internal-only grays (`--color-navy-gray-1|2|3`) **never** appear in client-facing UI.

## Typography

System fonts only. No web fonts. `--font-sans` for body/UI/buttons and all tables/data displays (numerals in `ui-monospace`); `--font-mix` (Georgia) for navigation, display headings, card titles — never for tables or data, where serif slows comparison.

| Element | Font | Size | Line-height |
|---|---|---|---|
| Display | Mix | 64pt | 0.95 |
| H1 | Mix | 44pt | 1.05 |
| H2 | Mix | 32pt | 1.1 |
| H3 | Mix | 24pt | 1.2 |
| Body | Sans | 16pt | 1.5 |
| Eyebrow | Sans Light | 13pt | ALL CAPS, 10% tracking |

Display drops to 44pt at ≤768px, 32pt at ≤480px (`word-break: break-word`). Eyebrows and buttons are ALL CAPS; headlines are sentence case; proper nouns are Title Case.

## Spacing, breakpoints, motion

```
--space-1: 4   --space-2: 8   --space-3: 12   --space-4: 16
--space-5: 24  --space-6: 32  --space-7: 48   --space-8: 64   --space-9: 96   (px)

--bp-sm: 640   --bp-md: 768   --bp-lg: 1024   --bp-xl: 1280   --bp-2xl: 1536  (px)

--duration-fast: 100ms   --duration-base: 200ms   --duration-slow: 300ms   --duration-deliberate: 500ms
--ease-standard: cubic-bezier(0.4, 0, 0.2, 1)
--ease-emphasis: cubic-bezier(0.2, 0, 0, 1)
--ease-exit:     cubic-bezier(0.4, 0, 1, 1)
```

Vertical rhythm: `--space-4` between siblings, `--space-6` between sections, `--space-8` between major regions. Sidebar collapses to drawer below `--bp-lg`. Always wrap motion in `@media (prefers-reduced-motion: reduce)` — never `transition: none`.

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

## Component states (universal)

Every interactive element has six states: **default**, **hover** (per surface), **focus-visible** (2px outline at `--focus-ring`, 2px offset / 3px on buttons), **active** (one step darker, no movement), **disabled** (`opacity: 0.4`, `pointer-events: none`), **loading** (spinner replaces label, dimensions retained). `outline: none` without a visible replacement is forbidden.

## Extrapolating to new components

When the spec doesn't directly cover a component, **compose from existing tokens — never invent**. Defaults: `--bg-surface` background, 1px `--border-light` border, 2px radius, `--space-4`/`--space-5` padding, `--text-primary` body text, `--accent-interactive` for any interactive accent. Run the subtlety test: if it feels visually loud, it's wrong. Full playbook and pre-flight compliance gates: `extrapolating-the-system.md`.

## Companion specs — load alongside _core-requirements.md

_core-requirements.md is the constitution. The detail for every surface and pattern lives in a companion file. Builds **must** consult these — don't improvise.

| Surface / concern | Companion file |
|---|---|
| Extrapolating to new components (compliance gates) | `extrapolating-the-system.md` |
| Responsive & mobile (320px gate, gotchas, drawer rules) | `responsive-and-mobile.md` |
| App shell & headers (top bar, layout frame) | `app-shell-and-headers.md` |
| Application lockup & naming (McDermott symbol + divider + app name, naming convention) | `application-lockup.md` |
| Navigation & IA (sidebar, tabs, breadcrumbs) | `navigation-and-ia.md` |
| Forms & input (anatomy, validation, per-input rules) | `forms-and-input.md` |
| Steppers & wizards (multi-step flows) | `steppers-and-wizards.md` |
| Disclosure surfaces (modal, sheet, popover, inline) | `disclosure-surfaces.md` |
| Notifications & feedback (toast, banner, inline alert, badge) | `notifications-and-feedback.md` |
| Loading, empty & error states | `loading-empty-and-error-states.md` |
| Iconography (Phosphor only, sizing, a11y) | `iconography.md` |
| Data visualization & tables (charts, table patterns) | `data-visualization.md` |
| UX copy & microcopy (voice, errors, buttons, empty-state copy) | `ux-copy-and-microcopy.md` |
| Accessibility (WCAG 2.2 AA recipes, ARIA, keyboard) | `accessibility.md` |
| AI — trust & provenance (citations, confidence, AI vs human) | `ai-trust-and-provenance.md` |
| AI — streaming & latency (cursor, auto-scroll, stop) | `ai-streaming-and-perceived-latency.md` |
| AI — tool use & agency (tool calls, approvals, multi-step) | `ai-tool-use-and-agency.md` |
| AI — uncertainty & errors ("I don't know", refusals, hallucination guards) | `ai-uncertainty-and-errors.md` |
| AI — feedback & correction (thumbs, regenerate, edit) | `ai-feedback-and-correction.md` |
| AI — prompting affordances (chips, slash commands, empty state) | `ai-prompting-affordances.md` |

## Anti-patterns — never do this

Hardcoded hex (use tokens). `var(--color-teal)` outside its two allowed uses. Alert colors on text (they're fills; text is navy). `--text-primary` on pale or alert backgrounds. `--color-navy-gray-*` in client-facing UI. App identity rendered as the letters "McDermott" in type instead of the inline symbol SVG. Border radius between 2 and 999px. Wrapping buttons. Title Case headlines. "OK"/"Submit"/"Yes"/"No" button labels — use verb + noun. Exclamation marks or "Oops!"/"Just" in errors. Asterisks for required fields (mark optional). Placeholder as the only label. `outline: none` without a replacement. Color as the sole indicator of state. Filled or duotone Phosphor variants. Pie charts >5 slices, 3D charts, dual-axis charts. `body { overflow-x: hidden }` (breaks sticky positioning — use `overflow-x: clip` on `html`). Flex item containing overflow content without `min-width: 0`. Wrapping a table in `overflow-x: auto` without a `min-width` on the table. Auto-executing destructive AI actions. Numeric confidence scores on AI output. Modal feedback prompts. Pale fill for filtered-to-zero empty states (use `--bg-surface` + border). Generic spinner for AI generation (use thinking dots). Generic "Error" message with no recovery action.

---

**Reference implementation:** `mws-design-system-showcase.html` in this directory. Every rule above is demonstrated there in both light and dark mode with working interactions. When in doubt about how a pattern should look or behave, refer to the showcase before generating new code.

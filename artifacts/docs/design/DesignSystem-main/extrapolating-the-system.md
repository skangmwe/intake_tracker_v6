---
name: McDermott Extrapolating The System
description: 'Use whenever building components or patterns NOT explicitly defined in the McDermott design system. Triggers when generating new UI patterns, when extending existing patterns to novel use cases, when designing something the spec does not directly cover, when an AI tool generates output that needs alignment with McDermott aesthetic, or when reviewing AI-generated UI before it ships. Always load this skill if you are about to invent something new.'
version: 1.0.0
---
# McDermott Extrapolating The System
You will build components that aren't explicitly speced. This file is the playbook for staying in the system anyway. Read this when the design system doesn't directly tell you what to do.

## **PRE-FLIGHT COMPLIANCE GATES — check ALL of these before shipping any UI**

These ten rules are the most-violated patterns in AI-generated McDermott UI. Verify *every single one* before considering any component done. Each has been seen broken in a real generation; each links to the spec rule that prevents it.

### 1. Mobile sidebar = drawer. ALWAYS.
- ❌ Sidebar stacks above content as a vertical block on mobile
- ❌ Sidebar disappears entirely with no replacement (no hamburger)
- ✅ Below 1024px: hamburger in top bar opens a `position: fixed` drawer (`width: min(85vw, 320px)`) sliding in from left with a scrim, focus trap, Escape/scrim-click/link-click close.

→ Rule lives in `navigation-and-ia.md` ("Mobile sidebar pattern"). The drawer is a non-negotiable. If your mobile output shows the sidebar above content or removes it without a hamburger replacement, the rule is broken.

### 2. Steppers use a continuous track. NEVER bordered rectangles.
- ❌ Each step in a hard-bordered box (the "generic enterprise wizard" failure)
- ❌ Different shapes for different states (active = square, others = circles)
- ✅ Circles connected by a 1px `--border-light` track that becomes 2px `--accent-interactive` between completed steps. All states render at the same dimensions and sit on the same baseline.

→ Rule lives in `steppers-and-wizards.md`. The bordered-rectangle pattern is the single most common stepper failure.

### 3. Top bar never wraps any element to a second line.
- ❌ "DRAFT · AUTO-SAVED" wrapping to "DRAFT / AUTO- / SAVED"
- ❌ "Live · auto-calculating" wrapping word-by-word
- ❌ Breadcrumb segments wrapping inside their own slot
- ✅ At each breakpoint, the hide/compress/move rules from `app-shell-and-headers.md` kick in *before* anything wraps. Word-by-word wrapping is *always* a layout bug.

→ Rule lives in `app-shell-and-headers.md` ("Hard mobile breakpoint rules"). If anything wraps awkwardly, the collapse step was missed.

### 4. Card content is responsive, not just the card itself.
- ❌ Segmented control (Linear / Priority / TAR) cut off on the right inside a card
- ❌ Side-by-side fields (Rate class | Rate year) staying side-by-side on phones
- ❌ 3-column field layout not collapsing inside a card on narrow viewports
- ✅ The card is a wrapper, not an isolation chamber. Content inside follows the same responsive rules as standalone form content. Segmented controls wrap, convert to select, or scroll horizontally below 640px. Multi-column field layouts stack to single column below 768px.

→ Rule lives in `_core-requirements.md` ("Card content must be fully responsive") and `forms-and-input.md` (segmented control mobile behavior).

### 5. Sidebar content fits viewport height — or scrolls internally.
- ❌ User profile (or any sidebar content) cut off below the fold
- ❌ Sidebar content runs past the viewport with no scroll affordance
- ✅ Sidebar has `height: 100vh; overflow-y: auto`. Important persistent content (user profile, primary actions) is pinned at the bottom (`margin-top: auto` or sticky-bottom) so it stays visible regardless of nav length.

→ Rule lives in `navigation-and-ia.md` ("Sidebar height & internal scroll").

### 6. No horizontal page scroll at any viewport.
- ❌ Page can be scrolled horizontally to reveal cut-off content
- ❌ Content bleeds past the right edge of the viewport
- ✅ Constraint cascade: `html { overflow-x: clip; max-width: 100vw }`, `.app { max-width: 100vw; min-width: 0 }`, `.main { max-width: min(100%, 1200px); min-width: 0 }`, every section and flex container has `min-width: 0`. Wide content (tables, code blocks) scrolls within its OWN container, never pushes the page.

→ Rule lives in `responsive-and-mobile.md` ("The full overflow-cascade pattern" and "The flex `min-width: auto` gotcha").

### 7. Buttons never wrap labels.
- ❌ "GENERATE BRIEF" wrapping to two lines
- ❌ Button labels that don't fit in min-width
- ✅ `white-space: nowrap` on `.btn`. Keep labels short. If a label doesn't fit, shorten it or use icon-only with `aria-label`.

→ Rule lives in `_core-requirements.md` (Buttons spec).

### 8. `--color-teal` is direct only for two surfaces.
- ❌ Teal primary button in light mode (should use `--accent-interactive` which is blue in light)
- ❌ Teal selected state on form controls in light mode
- ❌ Teal icons or accents in light mode
- ✅ Direct `var(--color-teal)` only for: (1) sidebar active state (sidebar is navy in both themes), (2) categorical chart series. Everything else interactive uses `var(--accent-interactive)`.

→ Rule lives in `_core-requirements.md` ("Teal vs `--accent-interactive`").

### 9. Theme-stable foreground rule on pale and alert fills.
- ❌ White text on pale-blue background in dark mode (themed text token used on theme-stable bg)
- ❌ Red text inside an error alert (alert colors are background fills only)
- ✅ Text on pale fills (`--color-pale-*`) and alert fills is ALWAYS navy, regardless of theme. Never use `var(--text-primary)` on these surfaces.

→ Rule lives in `_core-requirements.md` (Theme-stable foreground rule).

### 10. One leading marker per nav item.
- ❌ Sidebar row with [number] + [icon] + label (three competing markers per row)
- ❌ Mixed marker conventions within a single section
- ✅ Numbered nav items have ONLY a number (no icon). Categorical nav items have ONLY an icon (no number). Section labels group the two patterns when both exist in the same sidebar.

→ Rule lives in `navigation-and-ia.md` ("Nav item leading markers").

### 11. Sidebar is for inter-section navigation, NOT for stepper steps.
- ❌ Sidebar lists "Setup / Processing / Review / Summary" as nav items when the canvas already has those as a stepper
- ❌ Sidebar shows running totals, status indicators, or in-flow progress
- ✅ Sidebar contains only app-scoped navigation (pages, tools, settings, account). The canvas stepper handles in-flow progress. Don't duplicate.

→ Rule lives in `navigation-and-ia.md` ("What belongs in sidebar nav") and `steppers-and-wizards.md` ("Steppers do NOT belong in sidebar nav"). If a multi-step flow is the only purpose of a surface, omit the sidebar entirely on that surface — the canvas stepper is sufficient. Don't manufacture a sidebar to mirror the stepper.

---

**If any of these ten rules is broken in a generation, the output is non-compliant — even if everything else looks right.** Treat these as gates, not guidelines. They exist because each one has been violated by a real AI generation we had to correct.

## The system's posture (memorize before generating anything new)

- **Navy + pale + accent.** Saturated colors are *targeted spice*, not default tools.
- **Subtle wins.** When in doubt, use less color, lighter borders, less visual weight.
- **Borders are 1px in `--border-light`.** Always. Never 2px navy or black outlines.
- **Radii are 2px or 999px.** Never 4px, 6px, 8px, 12px, or anything else.
- **Every component is responsive.** Mobile is not an afterthought — it's a first-class concern.
- **The theme adapts.** Test light AND dark for every new pattern before considering it done.

If a new component feels "generic enterprise AI-design" — heavy outlines, multiple gradient backgrounds, every card with its own drop shadow, rainbow status colors, rounded 8px corners — it's wrong. The McDermott system is consciously restrained.

## The 6 governing rules (every new component must follow)

1. **Theme-stable foreground rule** — text on pale fills (`--color-pale-*`) and alert fills (`--color-error/-success/-warning`) is **always navy**, never `var(--text-primary)`. The pale and alert tokens don't shift between themes, but the text token does. Mixing them produces invisible text in dark mode.

2. **`--color-teal` direct usage is restricted** to exactly two cases:
   - Sidebar active state (sidebar is navy in both themes; teal contrasts on dark)
   - Categorical chart series in data viz when teal is one of multiple colors

   **Everything else interactive uses `var(--accent-interactive)`** — blue in light mode, teal in dark. This includes primary buttons, AI accents, focus rings, selected states, single-series chart fills, and any interactive border accent.

3. **Border radius is 2px or 999px (pills).** Anything in between is wrong.

4. **Buttons never wrap.** `white-space: nowrap` on `.btn`. Keep labels short — short enough to fit on one line at the narrowest viewport you support.

5. **Hover convention** — clickable text-bearing elements (links, nav, content titles, chips, follow-ups) flip **both** the border accent **and** the text color to `var(--accent-interactive)` on hover. Border-only is the broken state. **Solid buttons fill on hover instead** (Secondary → navy/teal fill per theme), not this flip.

6. **WCAG 2.2 AA is the floor**, not a stretch goal. Touch targets ≥ 24×24 (≥44×44 preferred), focus visible, color never the sole indicator of state, semantic HTML before ARIA.

## Build by composition, never by invention

You almost never need to invent a new visual treatment. Compose from the existing tokens and patterns.

**Need a card-like surface?** Use `.card` styling: `var(--bg-surface)` background, 1px `var(--border-light)` border, `var(--radius)` (2px) corners, `var(--space-5)` padding.

**Need to highlight something?** Use a pale token (`--color-pale-blue/-success/-orange/-gold/-magenta`) as background with navy text. If you need more emphasis, add a 4px left border in the matching accent color.

**Need an interactive accent?** Use `var(--accent-interactive)` (semantic token), never `--color-teal` or `--color-blue` directly. The semantic token flips per theme correctly.

**Need to separate sections?** Use a 1px `var(--border-light)` line — `border-bottom` or `border-top`. Not a hard box, not a thick rule, not a gradient divider.

**Need an icon?** Phosphor regular weight only, sizes 16 / 20 / 24 / 32 / 48 (never in between). Color: `var(--icon-default)` for default, `var(--accent-interactive)` for interactive.

**Need a spacing value?** Use `--space-*` tokens (4, 8, 12, 16, 24, 32, 48, 64, 96). No arbitrary px values.

**Need a shadow?** Use `--shadow-sm` / `--shadow-md` / `--shadow-lg`. Most surfaces should have none — shadows are for elevation hierarchy, not decoration.

## The subtlety test

When a new component is generated and feels visually loud, run it through these questions:

- **Does this element have a thick border?** → It should probably be 1px `--border-light`.
- **Is this background a saturated color?** → It should probably be `--bg-surface` or a pale token.
- **Does this look like every other generic AI-generated enterprise wizard / dashboard / settings panel?** → It needs to be more refined — less chrome, more restraint.
- **Could I remove a border or background and the meaning would still be clear?** → Remove it.
- **Is this component using more than 2 colors beyond navy/white/text?** → Probably one too many. Pull back.

## Responsive expectations (non-negotiable)

**Every new component must work at viewports from 320px to 1920px+.** This is not a "nice to have."

**Posture: mobile design is editing, not scaling.** When adapting any layout to a narrow viewport, every element gets one of five treatments: *keep, remove, move, reshape, or replace*. Uniformly shrinking a desktop layout never produces a working mobile experience — it gives you cramped buttons, unreadable labels, and word-by-word header wraps. The work is editorial. See `responsive-and-mobile.md` for the full principle.

Every generation must pass this 6-point checklist:

1. **No fixed widths** that exceed 320px without an explicit overflow strategy (horizontal scroll, ellipsis, wrap, hide)
2. **Flex and grid items have `min-width: 0`** if they contain potentially-overflowing content (the flex `min-width: auto` gotcha — see `responsive-and-mobile.md`)
3. **Long text wraps gracefully** — `overflow-wrap: break-word` on text containers; never let long unbroken strings push the layout wider
4. **Touch targets ≥ 24×24** at all viewports — 44×44 preferred for primary actions
5. **No horizontal page scroll** — use `overflow-x: clip` on html (not `hidden` on body — that breaks sticky)
6. **Sticky positioning survives** — sidebar and top bar must remain sticky on desktop after any new component is added

If a new component breaks any of these on a 320px viewport, it's not done. Mobile responsiveness is not a deferred concern.

## When you can't find a spec — decision flow

Don't freeze and don't invent wildly. Walk this flow:

1. **Is there a similar pattern in the showcase HTML?** Match its treatment.
2. **Is there a related skill file?** Apply its rules to this new context. (Example: a "wizard" isn't speced separately from "steppers-and-wizards.md" — that file's rules apply.)
3. **Still nothing?** Default to:
   - Background: `var(--bg-surface)`
   - Border: 1px `var(--border-light)`
   - Radius: 2px (`var(--radius)`)
   - Padding: `var(--space-4)` or `var(--space-5)`
   - Body text: `var(--text-primary)`
   - Headings (if any): `var(--font-mix)` Georgia
   - Interactive accents: `var(--accent-interactive)`
   - Spacing between items: `var(--space-3)` or `var(--space-4)`
4. **Never invent new colors.** Use only tokens from the palette. If you need a new shade, you don't.
5. **Never invent new spacing values.** Use only `--space-*` tokens.
6. **Never invent new radii.** 2px or 999px.

If you find yourself wanting to set `border-radius: 6px` or `background: #f5f5f5` — stop. The system has tokens for what you need.

## Common AI-generated patterns to push back on

When generating UI (or reviewing AI-generated output), watch for these failure modes:

- **Hard 2px navy or black outlines** on cards or sections → soften to 1px `var(--border-light)`
- **Saturated colored backgrounds** on routine surfaces → swap to `var(--bg-surface)` or a pale token
- **Gradient backgrounds** → flatten to a solid token
- **Drop shadows on every card** → most surfaces need no shadow; reserve for elevation hierarchy (modal, dropdown)
- **Rounded corners > 2px** → reduce to 2px (or 999px for pills)
- **Generic gray placeholders** → use a pale background with a Mix-font letter as a brand-aligned placeholder
- **Buttons with 4px or 8px radius** → enforce 2px
- **Excessive emoji or decorative flourishes** → strip them; McDermott voice is precise, not playful
- **Saturated `--color-teal` everywhere in light mode** → swap to `var(--accent-interactive)` for everything except sidebar active and chart series
- **Title Case headlines** → sentence case (per UX copy skill)
- **"Oops!", "Just", exclamation marks in errors** → strip per UX copy skill
- **Hard-bordered rectangles around each step in a stepper** → continuous track pattern (see steppers skill)
- **Header content wrapping word-by-word on mobile** → collapse strategy is wrong (see app-shell-and-headers skill)

## When asked to "make it more on-brand"

The fastest path: reduce. Remove borders, flatten shadows, swap saturated to pale, replace teal with accent-interactive, drop rounded corners to 2px, ensure text contrast meets the theme-stable rule. The McDermott aesthetic emerges from restraint, not from adding more brand elements.

## Anti-patterns — Never Do This
- Invent new color tokens (always use existing palette)
- Invent new spacing values (always use `--space-*`)
- Use 2px or thicker borders for component framing (1px only — heavier borders are for left-rail accents)
- Use `--color-teal` directly outside the two allowed cases (sidebar, chart series)
- Treat any component as desktop-only (responsive at 320px is mandatory)
- Default to gradients or saturated backgrounds (use pale tokens or `--bg-surface`)
- Use rounded corners between 2px and 999px (only 2px or 999px)
- Build something that doesn't survive a theme toggle (test light AND dark before shipping)
- Skip the showcase as a reference (when in doubt, match its patterns)
- Generate a component without considering its mobile behavior
- Use generic enterprise-AI "wizard box" patterns when the McDermott system has its own (subtler) treatment
- Ignore the subtlety test — if it feels visually loud, it's wrong

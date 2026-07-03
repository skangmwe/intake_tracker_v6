---
name: McDermott Extrapolating The System
description: 'Use whenever building components or patterns NOT explicitly defined in McDermott. Triggers when generating new UI patterns, extending existing patterns to novel use cases, designing something the spec doesn''t directly cover, or reviewing AI-generated UI before it ships.'
version: 1.0.0
---
# McDermott Extrapolating The System
You will build things that aren't speced. This is the playbook for staying in the system anyway.

## Pre-flight compliance gates — check ALL before shipping any UI

These 11 rules are the most-violated patterns in AI-generated McDermott UI. Verify every one before any component is done.

1. **Mobile sidebar = drawer, ALWAYS.** Below 1024px: hamburger in top bar opens a `position: fixed` drawer (`width: min(85vw, 320px)`) sliding from left with scrim, focus trap, Escape/scrim/link-click close. Never stack the sidebar above content; never remove it without a hamburger replacement. → `navigation-and-ia.md`

2. **Steppers use a continuous track, never bordered rectangles.** Circles connected by a 1px `--border-light` track that becomes 2px `--accent-interactive` between completed steps. All states render at the same dimensions on the same baseline. The bordered-rectangle pattern is the single most common stepper failure. → `steppers-and-wizards.md`

3. **Top bar never wraps any element to a second line.** Word-by-word wrapping ("DRAFT / AUTO- / SAVED") is *always* a layout bug — the hide/compress/move rules must kick in before anything wraps. → `app-shell-and-headers.md`

4. **Card content is responsive, not just the card.** Segmented controls inside cards must wrap, convert to select, or scroll horizontally below 640px. Multi-column field layouts inside cards stack to single column below 768px. The card is a wrapper, not an isolation chamber. → `forms-and-input.md`

5. **Sidebar fits viewport height — or scrolls internally.** `height: 100vh; overflow-y: auto`. Pin persistent content (user profile, primary actions) at the bottom (`margin-top: auto`) so it stays visible. → `navigation-and-ia.md`

6. **No horizontal page scroll at any viewport.** Constraint cascade: `html { overflow-x: clip; max-width: 100vw }`, `.app { max-width: 100vw; min-width: 0 }`, every flex/grid item containing potentially-overflowing content gets `min-width: 0`. Wide content scrolls within its OWN container. → `responsive-and-mobile.md`

7. **Buttons never wrap labels.** `white-space: nowrap`. Keep labels short. Icon-only with `aria-label` if a label won't fit. → _core-requirements.md

8. **`--color-teal` is direct only for two surfaces:** sidebar active state, and categorical chart series. Everything else interactive uses `var(--accent-interactive)` (blue light / teal dark). → _core-requirements.md

9. **Theme-stable foreground rule on pale and alert fills.** Text on `--color-pale-*` and `--color-error|success|warning` is **always navy**, never `var(--text-primary)`. The pale/alert tokens don't shift between themes; the text token does. → _core-requirements.md

10. **One leading marker per nav item.** Numbered nav items have ONLY a number (no icon). Categorical nav items have ONLY an icon (no number). Never both. → `navigation-and-ia.md`

11. **Sidebar is for inter-section navigation, NOT for stepper steps.** Sidebar contains only app-scoped navigation (pages, tools, settings, account). The canvas stepper handles in-flow progress — never duplicate. If a flow is the only purpose of a surface, omit the sidebar entirely there. → `navigation-and-ia.md` + `steppers-and-wizards.md`

If any gate is broken, the output is non-compliant — even if everything else looks right. Treat as gates, not guidelines.

## System posture (memorize)
- **Navy + pale + accent.** Saturated colors are *targeted spice*, not default tools.
- **Subtle wins.** Less color, lighter borders, less visual weight.
- **Borders are 1px `--border-light`.** Never 2px navy or black outlines.
- **Radii are 2px or 999px.** Never 4/6/8/12px or anything else.
- **The theme adapts.** Test light AND dark before shipping any new pattern.

If a new component feels "generic enterprise AI-design" — heavy outlines, gradients, drop shadows on everything, rainbow status colors, 8px rounded corners — it's wrong. McDermott is consciously restrained.

## Build by composition, never invention
You almost never need to invent. Defaults:
- **Card-like surface** → `--bg-surface`, 1px `--border-light`, 2px radius, `--space-5` padding
- **Highlight something** → pale token background + navy text; add a 4px left border in the matching accent for more emphasis
- **Interactive accent** → `var(--accent-interactive)` (never `--color-teal` or `--color-blue` direct)
- **Section separator** → 1px `--border-light` line. Not a hard box, not a gradient
- **Icon** → Phosphor regular weight, sizes 16/20/24/32/48 only
- **Spacing** → `--space-*` tokens only (4, 8, 12, 16, 24, 32, 48, 64, 96)
- **Shadow** → `--shadow-sm/md/lg`. Most surfaces have none — shadows are for elevation hierarchy

## The subtlety test
If a generated component feels visually loud, ask:
- **Thick border?** → 1px `--border-light` instead.
- **Saturated background?** → `--bg-surface` or a pale token.
- **Looks like generic AI-enterprise UI?** → More restraint, less chrome.
- **Could I remove a border or fill and the meaning stays clear?** → Remove it.
- **More than 2 colors beyond navy/white/text?** → Probably one too many.

## When you can't find a spec — decision flow
1. **Similar pattern in the showcase HTML?** Match its treatment.
2. **Related skill file?** Apply its rules to this new context.
3. **Still nothing?** Default to: `--bg-surface` bg, 1px `--border-light`, 2px radius, `--space-4`/`--space-5` padding, `--text-primary` body text, `--accent-interactive` for interactive accents.
4. **Never invent colors, spacing, or radii.** If you want a new shade or `border-radius: 6px`, stop — the system has tokens for what you need.

## When asked to "make it more on-brand"
The fastest path: **reduce**. Remove borders, flatten shadows, swap saturated to pale, replace teal with `--accent-interactive`, drop rounded corners to 2px, fix theme-stable text. McDermott aesthetic emerges from restraint, not from adding brand elements.

## Anti-patterns
- Invent new color tokens / spacing values / radii
- 2px+ borders for component framing
- `--color-teal` direct outside its two cases
- Gradients or saturated backgrounds as default
- Generate without considering mobile behavior
- Skip the showcase as a reference
- Ignore the subtlety test

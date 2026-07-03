---
name: McDermott Steppers & Wizards
description: 'Use when designing or building multi-step flows, wizards, progress indicators, stepper navigation, form sequences, onboarding flows, checkout flows, application wizards, or any sequential task UI with a visible progression.'
version: 1.0.0
---
# McDermott Steppers & Wizards
Multi-step flows are linear journeys through bounded tasks. The stepper communicates progress, allows backward navigation, and survives interruption. Get this right and the user always knows where they are in a process.

## When to use a stepper
- Sequential task with 3–6 distinct steps
- Each step has its own form, content, or decision
- User's progress through the flow should be visible at all times
- Backwards navigation is useful (review, edit prior input)

## When NOT to use
- 1–2 step flow → use a single page with clear section headers
- More than 7 steps → split into multiple flows or use a different navigation pattern (sidebar nav, document outline)
- Unrelated tasks → use tabs instead (steps imply sequence)
- Steps the user shouldn't see → use a single-page progressive form

## Anatomy
A stepper has four pieces:
1. **Step indicators** — circles with numbers or icons
2. **Step labels** — sentence case, brief (1–3 words)
3. **Connecting line** — 1px between circles, communicates progression
4. **Active step's content** — full form or content panel below the stepper

## States — the critical part
This is the most-broken part of every "generic AI wizard" output. Each step has exactly four valid visual states. **All four states must render at the same circle dimensions** (36px desktop, 28px mobile) so the row stays on a single horizontal baseline — state changes never shift vertical position. See the "Vertical alignment rule for indicator rows" in `_core-requirements.md`.

**Foreground colors on filled circles follow the filled-accent foreground rule** (see `_core-requirements.md`): on `--accent-interactive` fills, the icon/number is **white in light mode, navy in dark mode** — never the reverse. Navy on blue (light mode failure) and white on teal (dark mode failure) are both contrast bugs. Error circles use navy on red in both themes per the separate theme-stable rule (alert fills are not theme-flipped).

| State | Circle | Label | Connector to next |
|---|---|---|---|
| **Not started** | Transparent fill, 1.5px `--border-light` ring, muted number in `--text-secondary` | `--text-secondary` | 1px `--border-light` |
| **Current (active)** | Filled `--accent-interactive`; number is **white in light, navy in dark** | `--text-primary`, weight 500 | 1px `--border-light` (next is not done yet) |
| **Completed** | Filled `--accent-interactive`; Phosphor `check` icon is **white in light, navy in dark** | `--text-primary`, normal weight | 1px `--accent-interactive` (segment is done) |
| **Error** | Filled `--color-error`; Phosphor `warning` icon is **navy in both themes** (theme-stable rule on alert fills) | `--text-primary` | 1px `--border-light` |

**Never use a heavy bordered rectangle around each step.** That's the most common "generic enterprise wizard" mistake — it fragments the flow into segments instead of showing it as a continuous journey. The step indicators sit on a horizontal track; the framing comes from the track, not from boxing each step.

## State persistence — a step's state is not its navigation state
Step states reflect **whether the step's work is done**, not whether the user is currently viewing it. A completed step stays in the completed state when the user navigates away from it. The stepper is a *trail*, not a "highlight the active page" indicator.

| User's location | Step 1 | Step 2 | Step 3 |
|---|---|---|---|
| On step 1, before entering data | current | not started | not started |
| On step 1, after entering valid data, before continuing | current (could optionally show a pre-complete state) | not started | not started |
| Continued to step 2 | completed | current | not started |
| Continued to step 3 | completed | completed | current |
| Past step 3, viewing output (e.g., Brief summary) | completed | completed | completed |
| Returned to step 1 from a later position (free flow) | current | completed | completed |

**Key rule:** when the user navigates back to a previously-completed step, the step transitions from "completed" back to "current" *only for the step they're now on* — the others stay completed. If the user backtracks and re-edits step 1, step 2 and step 3 may need to be re-validated; mark them with an error or "needs re-review" state if validation fails after editing upstream.

**On output / summary pages** (pages reached *after* the wizard, like the Brief summary in this app), all wizard steps render as **completed** — the stepper functions as a "what you finished" summary, not a current-position indicator. There is no "current" step in the stepper when the user is on the output page. The current view is communicated by the sidebar's active state on the output item, not by the stepper.

The bug class this rule prevents: a stepper that resets to all-inactive when the user is "between" steps or on a non-wizard page, hiding the fact that the work has been done. The data is in the system; the stepper must reflect that.

## Layout

**Desktop (≥768px):**
- Horizontal row across the top of the content area
- Step circles 36px diameter
- Labels below each circle (centered) OR beside each circle (left-aligned, for vertical layouts)
- 2px connecting line between circle edges (not all the way through the circle)
- Generous spacing — let the track breathe (min `--space-7` between step centers on desktop)

**Mobile (<768px) — pick ONE pattern per surface, never mix:**

*Pattern A — Compact horizontal:* Single row, smaller circles (28px), labels truncated or hidden, horizontal scroll if needed. Active step always scrolled into view.

*Pattern B — Single-step focus:* Show only the current step prominently ("Step 2 of 4 · Processing") plus a thin progress bar below. Tap the indicator to expand into the compact-horizontal stepper.

Pattern B works better for flows with 5+ steps. Pattern A is fine for 3–4 step flows.

## Navigation rules

- **Linear flow** (default): only forward; completed steps clickable to revisit, future steps locked
- **Free flow** (use sparingly): any completed step clickable; useful for "review your answers" patterns
- Always include a **Back** button (except step 1)
- Primary action on each step is **Continue** — explicit verb, not "Next" (per UX copy skill: verb + noun)
- Final step's primary action names the actual outcome: "File brief", "Create project", "Publish"
- Both Back and Continue must be keyboard-reachable

## Validation across steps

- Validate **on Continue**, not on per-field blur within a step
- If validation fails: show inline field errors AND mark the step indicator in error state
- User cannot advance until errors are resolved
- Going Back **always preserves all previously-entered data**
- Don't silently lose data on browser refresh — autosave or warn

## Mobile responsiveness checklist
Every stepper in McDermott must pass:
- [ ] Renders correctly at 320px viewport
- [ ] All step indicators reachable (scrollable if not all fit)
- [ ] Active step always visible (auto-scroll into view on step change)
- [ ] Touch targets ≥ 24×24 on step circles (≥44×44 on Continue/Back)
- [ ] Content area below the stepper reflows to single column
- [ ] Works in both light and dark theme

## McDermott-specific tokens
- Circle diameter: 36px desktop, 28px mobile compact, 40px mobile single-step
- Active fill: `var(--accent-interactive)` (blue light / teal dark)
- Completed connector: `var(--accent-interactive)` (1px → 2px transition on completion)
- Inactive connector & ring: 1px `var(--border-light)`
- Number text: Sans 13pt 600-weight, white in filled circles, `--text-secondary` in empty
- Labels: Sans 14pt below circle (sentence case), 12pt on mobile compact
- Step spacing (center-to-center): `var(--space-7)` desktop, `var(--space-5)` mobile compact

## Steppers do NOT belong in sidebar nav
A common AI-generation mistake: mirroring the canvas stepper as a list in the sidebar (Setup / Processing / Review / Summary, each with a number, icon, and label). **Don't do this.** It conflates two different concepts:

- **Sidebar nav** = traversing between distinct *sections of the app* (Brief summary, Reference, Admin panel, Settings, Tools). These are app-level destinations.
- **Stepper** = progress through a single *in-flow task* (steps within a wizard, with completed/current/error states). This is flow-scoped.

Mirroring the stepper in the sidebar:
- Duplicates the same information in two competing places
- Conflates "where in the app am I" with "where in this task am I" — different mental models
- Forces the sidebar to carry stepper *state* (completed/error icons) it isn't designed for
- Crowds the sidebar with items that don't survive when the user leaves the flow

**Rule:** if the canvas has a stepper, the sidebar does not list its steps. The sidebar contains only inter-section navigation — pages, tools, settings — that exist regardless of which step the user is on.

If a multi-step flow is the *entire* purpose of the app and there's no other navigation, the sidebar may be omitted on that surface, leaving only the canvas stepper. Don't manufacture a sidebar just to mirror the stepper.

## Stepper variants
Two valid top-of-content stepper patterns. Pick based on what each step *produces*:

### Circle stepper (default)
For navigation-heavy flows where each step is a distinct task with no carryover value worth surfacing in the progress bar. Onboarding, checkout, signup, simple multi-page forms. Visual: 36px circles (28px on mobile) with number, or `check` icon on completion, plus label below.

### Info stepper
For *calculation flows* where each step produces a value worth showing in the progress bar — multi-stage financial models, configuration wizards with running totals. Each step is a wider card showing:
- Step number (small, eyebrow style)
- Step name (Mix font, 22pt)
- Current value or status below (e.g., `Batch 4821 · 0042`, `14 records`, `$1,284,500`)

Active step gets a 2px top accent bar in `var(--accent-interactive)` (instead of a filled circle). Completed steps show their final value; not-started steps show `—` or a placeholder.

**Choosing between them:** if the user benefits from seeing the *result* of each prior step at a glance (calculator, financial model, configurator), use info stepper. If steps are tasks without persistent output values, use circle stepper.

## Anti-patterns — Never Do This
- Each step in a hard-bordered rectangle (fragments the flow — use a continuous track instead)
- Heavy 2px navy or black outlines around step indicators (1px `--border-light` only)
- Same color for all states (must visually distinguish not-started, active, completed, error)
- Navy icons or numbers on `--accent-interactive` fills in light mode (low contrast — use white in light, navy in dark; see "filled-accent foreground rule")
- State variations that change the circle's outer dimensions or padding (every state must render at the same size so the row stays on one baseline — see "vertical alignment rule for indicator rows")
- Stepper that resets to all-inactive when the user is on a non-wizard page (output, summary, viewing a saved record). Step state must persist — if the user has completed step 1, it stays completed in the stepper regardless of where they navigate. The stepper is a trail of completed work, not a "highlight current page" indicator.
- More than 7 steps (split into multiple flows)
- Hidden steps that appear conditionally (always show all steps so user knows scope)
- No Back button on steps 2+
- Validate field-by-field on blur (validate on Continue instead)
- Allow skipping ahead in a linear flow
- Vertical stepper on narrow mobile viewports (use compact horizontal instead)
- Lose user's previously-entered data when going Back
- Use `--color-teal` directly for active state (use `--accent-interactive` so it flips per theme)
- "Step X of Y" without also showing the visual track somewhere reachable

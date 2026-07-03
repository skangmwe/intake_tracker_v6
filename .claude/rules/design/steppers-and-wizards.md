---
name: McDermott Steppers & Wizards
description: 'Use when designing multi-step flows, wizards, progress indicators, stepper navigation, form sequences, onboarding flows, checkout flows, or any sequential task UI with visible progression.'
version: 1.0.0
---
# McDermott Steppers & Wizards
Linear journeys through bounded tasks. The stepper communicates progress, allows backward navigation, and survives interruption.

## When to use
- Sequential task with 3–6 distinct steps
- Each step has its own form, content, or decision
- Progress should be visible at all times
- Backward navigation is useful

## When NOT to use
- 1–2 steps → single page with section headers
- 7+ steps → split into multiple flows, or sidebar nav, or document outline
- Unrelated tasks → use tabs (steps imply sequence)
- Steps the user shouldn't see → single-page progressive form

## Anatomy
Four pieces: step indicators (circles with numbers or icons), step labels (sentence case, 1–3 words), connecting line (1px between circles), active step's content panel below.

## States (the critical part)
**All four states render at the same circle dimensions** (36px desktop, 28px mobile) so the row stays on a single baseline. State changes never shift vertical position.

**Filled-accent foreground rule:** on `--accent-interactive` fills, the icon/number is **white in light, navy in dark** — never the reverse. Error circles use **navy on red in both themes** (theme-stable rule).

| State | Circle | Label | Connector to next |
|---|---|---|---|
| Not started | Transparent fill, 1.5px `--border-light` ring, muted number in `--text-secondary` | `--text-secondary` | 1px `--border-light` |
| Current | Filled `--accent-interactive`; number white-in-light/navy-in-dark | `--text-primary`, weight 500 | 1px `--border-light` |
| Completed | Filled `--accent-interactive`; `check` icon white-in-light/navy-in-dark | `--text-primary` | 1px `--accent-interactive` |
| Error | Filled `--color-error`; `warning` icon navy in both themes | `--text-primary` | 1px `--border-light` |

**Never use a bordered rectangle around each step.** That's the most common "generic enterprise wizard" failure — fragments the flow into segments instead of a continuous journey. Framing comes from the track, not from boxing each step.

## State persistence — state reflects work, not viewing
A completed step **stays completed** when the user navigates away. The stepper is a *trail*, not a "current page" indicator.

| User location | Step 1 | Step 2 | Step 3 |
|---|---|---|---|
| On step 1, no data yet | current | not started | not started |
| Continued to step 2 | completed | current | not started |
| Continued to step 3 | completed | completed | current |
| On output/summary page (after wizard) | completed | completed | completed |
| Returned to step 1 (free flow) | current | completed | completed |

**On output pages** (reached *after* the wizard), all steps render as completed — the stepper is a "what you finished" summary. No "current" step. Current view is shown by the sidebar's active state on the output, not by the stepper.

The bug this prevents: a stepper that resets to all-inactive between steps or on non-wizard pages, hiding completed work.

## Layout

**Desktop (≥768px):** horizontal row across the top of the content area. 36px circles. Labels below or beside each. 2px connector between circle edges. Min `--space-7` between step centers.

**Mobile (<768px) — pick ONE pattern per surface:**

*Pattern A — Compact horizontal:* single row, 28px circles, labels truncated or hidden, horizontal scroll if needed. Active step always scrolled into view.

*Pattern B — Single-step focus:* show only the current step prominently ("Step 2 of 4 · Processing") plus a thin progress bar. Tap to expand into the compact horizontal stepper.

Pattern B works better for 5+ steps; Pattern A is fine for 3–4.

## Navigation rules
- **Linear flow** (default): forward only; completed steps clickable, future steps locked.
- **Free flow** (use sparingly): any completed step clickable; useful for "review your answers."
- Always include **Back** (except step 1).
- Primary action is **Continue** — verb + noun. Final step names the outcome ("File brief", "Create project").
- Back and Continue both keyboard-reachable.

## Validation across steps
Validate **on Continue**, not per-field blur. Fail → inline field errors AND mark the step indicator in error state. User can't advance until resolved. Going Back **always preserves prior data**. Don't lose data on browser refresh — autosave or warn.

## Steppers do NOT belong in sidebar nav
Common AI mistake: mirroring the canvas stepper in the sidebar. **Don't.** Sidebar = inter-section navigation (app-level destinations). Stepper = in-flow task progress (flow-scoped). Mirroring conflates two mental models.

If the canvas has a stepper, the sidebar does not list its steps. If a flow is the entire purpose of a surface and no other navigation exists, omit the sidebar there.

## Stepper variants
**Circle stepper (default):** navigation-heavy flows with no carryover value worth surfacing. Onboarding, checkout, signup. 36px circles (28px mobile) with number or `check`, label below.

**Info stepper:** *calculation flows* where each step produces a value worth showing — financial models, pricing calculators, configuration wizards. Each step is a wider card with: step number (eyebrow), step name (Mix 22pt), current value/status below (`Batch 4821 · 0042`, `$1,284,500`). Active step gets a 2px top accent bar instead of a filled circle.

Choose info stepper when users benefit from seeing prior step *results* at a glance; circle stepper otherwise.

## McDermott-specific tokens
- Circle: 36px desktop, 28px mobile compact, 40px mobile single-step
- Active fill: `--accent-interactive`
- Completed connector: `--accent-interactive` (1px → 2px on completion)
- Inactive: 1px `--border-light`
- Number: Sans 13pt 600-weight
- Label: Sans 14pt below (sentence case), 12pt mobile compact
- Step spacing center-to-center: `--space-7` desktop, `--space-5` mobile

## Anti-patterns
- Bordered rectangle around each step · 2px navy/black outlines (use continuous track + 1px `--border-light`)
- Same color for all states · states that change circle dimensions
- Navy icon on `--accent-interactive` in light mode (white-in-light / navy-in-dark)
- Stepper that resets to all-inactive on non-wizard pages
- More than 7 steps · hidden conditional steps
- No Back button on steps 2+ · validate field-by-field on blur · allow skipping ahead in linear flow
- Vertical stepper on narrow mobile · lose user's data on Back
- `--color-teal` direct for active state

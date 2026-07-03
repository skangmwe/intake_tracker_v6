# McDermott Claude Design → Claude Code Handoff (v1.5)

You are implementing a product whose design has been prototyped in **Claude Design** and exported to the bundle at `\artifacts\docs\design\project\`. Read this file before implementing anything.

**The build target is exact: everything the prototype contains (built exactly as the prototype shows it) plus every Save-for-/build screen the blueprint specifies — nothing more, nothing less.** There are **four sources**: the **prototype** (the exact spec for the screens it contains — scope, content, behavior, and visual form), the **blueprint** (the Save-for-/build screens the prototype doesn't contain, plus the structure that joins both halves), the **requirements** (source of intent), and the **design rules** (the McDermott token vocabulary and constraints you build with).

## The build, in one rule

**Build two sets of screens, and make them look like one product:**

1. **Prototyped screens** → build **exactly** what the prototype renders: scope, content, behavior, and visual form. The prototype is the spec; reproduce it.
2. **Save-for-/build screens** (in the blueprint, not in the prototype) → build from the blueprint's spec, and **style them to match the prototyped screens as closely as possible** — same components, spacing, type, color, and patterns, expressed in McDermott tokens.

Both halves ship together. The first half matches the prototype because it *is* the prototype; the second half matches the prototype because you make it so.

## The four sources

- **Prototype** (`\artifacts\docs\design\project\`) — the exact spec for every screen it contains. Build those screens to look and behave exactly as the prototype renders them.
- **Blueprint** (`full-design-blueprint.md`) — the Save-for-/build screens (admin, settings, auth, billing, notifications, reporting, etc.) with full purpose/role/content/business-rules/connections, plus the navigation graph and role/access matrix that join the two halves. Build every Save-for-/build screen from here.
- **Requirements** (`solution-requirements.md`) — source of intent: what each feature is supposed to do, who it serves, why it exists. Reference when the prototype and blueprint don't say *why*.
- **Design rules** — the McDermott design system: tokens (color, spacing, type, radii), components, constraints, and patterns. **The prototype has authority over the design system** — the rules are the vocabulary you build in and the fallback for anything the prototype doesn't specify, never a veto over what the prototype shows. Where the two conflict, the prototype wins.

## Reading the prototype — discipline (learned the hard way)

Three rules that prevent the most common ways prototype-reading goes wrong:

- **The canonical prototype is the focal file the `prototype-readme.md` names** (e.g., `My Product.html`). **Never infer layout from screenshots** — those are iteration captures, not the source of truth. **Never infer layout from the other HTML renders in the bundle** — those are sibling screens or intermediate iterations.
- **Read the rendered DOM, never grep class-name tokens to decide structure.** Class-token grepping finds dead leftover state from removed iterations — markup that's no longer rendered, dead code paths, leftover utility salads. The rendered DOM (open the file, look at what actually paints) is the only reliable structural signal.
- **If artifacts disagree, resolve per the precedence rules below — silently, without stopping.** Prototype vs. blueprint, focal file vs. sibling HTMLs, screenshots vs. HTML: every disagreement has a deterministic winner in the Conflicts section. Apply it and proceed; never pause to ask.

## Build the prototyped screens exactly

**For a prototyped screen, build exactly what the prototype shows** (this is a *within-screen* rule — it governs the contents of a screen the prototype renders, not which screens exist):

- Every feature, action, control, and data field the prototype renders **on that screen** → **build it**, even if the blueprint's row for that screen doesn't enumerate it.
- Anything the prototype does *not* render **on that screen** → **don't add it**, even if the blueprint or requirements mention it. No extra actions, fields, or controls invented from the plan.
- **This does NOT mean skipping screens that aren't in the prototype.** A screen the prototype never rendered is built from the blueprint — see the next section. The within-screen rule never suppresses a whole Save-for-/build screen.

**Port the prototype's visual form exactly:** visual hierarchy, spacing, motion, states, hover/active behaviors, transitions, layout, density, colors, component variants, typography. **The prototype's values are authoritative** — express each one in McDermott tokens, but never let the system pull the value away from what the prototype shows. When the prototype's value matches a token, use that token; when it doesn't, **preserve the prototype's exact value** by defining a **named override variable** in `web/src/mws/tokens.css` and consuming it via `var(--…)`. **Never snap the prototype's value to the nearest system value, and never inline a raw hex/px literal.** The override layer loads after the base tokens, so it supersedes them.

## Build the Save-for-/build screens from the blueprint, matched to the prototype

The prototype covers only the POC half. The other half — admin, settings, auth, billing, notifications, reporting, and every other Save-for-/build screen — is specified in `full-design-blueprint.md`. **Build every one of them**; if you build only what's in the prototype, the product ships half-finished.

These screens have no prototype to copy, so **make them look like the prototyped screens**: reuse the same components, spacing rhythm, type scale, color usage, nav pattern, and interaction patterns the prototype established, all in McDermott tokens (including any override variables you defined for the prototyped screens). The blueprint tells you *what* each screen is (purpose, role, content, business rules, connections); the prototype tells you *how the product looks*; the design rules are the vocabulary. Compose them so the two halves read as one product.

**Provenance annotations** — blueprint rows tagged `[from changelog: "<line>"]` record which decisions came from user iteration during prototyping. They're traceability markers, not overrides: the iteration happened *in* the prototype, so they already match it.

## Compose from the design rules

The McDermott design system defines tokens (colors, spacing scale, typography, radii), components (button, badge, card, etc.), default rules (responsive default, the lockup spec, theme-stable defaults), and patterns (navigation, layout). Start from `_core-requirements.md` (the constitution); it indexes the companion specs (`application-lockup.md`, `responsive-and-mobile.md`, `navigation-and-ia.md`, etc.). **These are your building blocks and your fallback** — compose them to reproduce the prototype and to style the Save-for-/build screens to match. Where the prototype diverges from any rule, the prototype wins (see Conflicts); the design system never overrides what the prototype shows.

## Conflicts — all auto-resolved silently

- **Prototype vs. blueprint on a prototyped screen: the prototype wins.** Build exactly what the prototype renders. The blueprint neither adds to nor subtracts from a prototyped screen's scope. Examples: the blueprint's row mentions a "save" action the prototype doesn't show (don't build it); the blueprint dropped a feature the prototype still renders (build it); the prototype shows a field the blueprint's row never listed (build it). The blueprint governs only the Save-for-/build screens, which have no prototype, plus the structure joining the halves.
- **Prototype vs. design rules: the prototype always wins.** The prototype has authority over the design system. When the prototype diverges from the design rules — a different radius, color, foreground treatment, identity/lockup, layout, or responsive behavior — follow the prototype, preserving its value through a named token-override variable (never a raw literal). The design rules are a fallback for what the prototype doesn't specify, never a veto. No escalation, no user stop.

No build-time confirmation anywhere: resolve per these rules and keep building.

## Where everything lives — and what each thing is for

Four things at known paths; the build reads them all in place.

- **`\artifacts\docs\design\project\`** — the prototype bundle. **The build spec for every screen it contains** — build those screens exactly as the prototype renders them (scope, content, behavior, and visual form).
- **`\artifacts\docs\design\full-design-blueprint.md`** — the reconciled plan. **The spec for the Save-for-/build half and for structure.** Contains the full screen map (POC + Save-for-/build), Save-for-/build screen specs (purpose, role, content, business rules, connections), the role/access matrix, cut reasoning, and open questions. For prototyped screens its rows are reference/structure, not the build spec. The master table also carries two per-screen review columns — **Prototype source** (which prototype file to diff a built screen against; blank means no prototype presence — visual review skips it) and **App route / component** (filled in by the build pipeline).
- **`\artifacts\docs\product\solution-requirements.md`** — the original requirements. **Reference for intent** — what the product is, who it's for, what each feature is supposed to do.
- **`\artifacts\docs\design\HANDOFF-design-brief.md`** — the original Claude Design prompt. **Superseded once the prototype exists; do not build from it.**

Note the `prototype-readme.md` at the root of `project/` (the file Claude Design ships, renamed by the handoff skill) describes the prototype — useful for *understanding* it, but **not** build instructions. Build from this README plus the blueprint and requirements; disregard in-archive READMEs as build instructions.

## How to build (do not free-build)

Run the northstar pipeline in order: **`/plan` → `/build` → `/ship`.** Let `/plan` read the requirements plus this design and produce the plan; implement only what `/build` drives. Don't jump straight to writing the app from the HTML.

## Design-system defaults (from _core-requirements.md) — fallback only; the prototype overrides them

The prototype has authority over the design system, so these are **defaults that apply only where the prototype doesn't show otherwise** — not hard constraints. Where the prototype diverges, follow the prototype (preserving any off-system value through the token override layer).

- **App identity:** the default is the McDermott lockup — the inline **symbol SVG** (the M-in-circle mark, `fill="currentColor"`) + divider + app name in Georgia, never the letters "McDermott" set in type (see `application-lockup.md`). If the prototype shows a different identity treatment, follow the prototype.
- **Radius, button wrapping, theme-stable foreground:** the defaults are radius 2px or 999px (pills), buttons that never wrap, and navy text on pale/alert fills. If the prototype shows otherwise (e.g. an 8px radius), preserve the prototype's value through an override variable.
- **Responsive:** the default is that every component works at 320px in both themes (editing, not scaling). Follow the prototype's responsive behavior where it shows one; fall back to this where it doesn't.
- **Express values through tokens (code-form rule, always applies):** preserve the prototype's values, but route them through McDermott custom properties — matching tokens where they fit, named override variables (e.g. `--text-body`, `--card-radius`) for anything off-system. Never inline raw hex/px literals. This governs how a value is written in code, not which value — so it never pulls a value away from the prototype.
- **No new dependencies;** don't invent components without a reason — and the prototype is a valid reason.

## Multi-screen flows

If the bundle is one screen of a multi-screen flow, implement just this screen and pause for review before the rest, unless the plan says otherwise.

---
name: McDermott App Shell & Headers
description: 'Use when designing or building application headers, top bars, app chrome, breadcrumbs, page titles, status indicators (autosave, sync, version), action toolbars, page-level navigation, persistent application frames, or any layout containing sidebar + topbar + content.'
version: 1.0.0
---
# McDermott App Shell & Headers
The persistent frame around any application surface. Pairs with `navigation-and-ia.md` (which covers global navigation patterns).

## **The top bar minimalism principle**

**Default to less.** The top bar exists to anchor the user — where am I, what's saved, what's the primary action. Everything else should live somewhere else with more breathing room. If you're stacking 4+ text elements across the top bar, you've put non-critical information in a high-priority slot. Move it.

A calm top bar has at most:
- **One** location indicator (current page name OR a breadcrumb capped at 2 segments)
- **One** primary action button (Save, Continue, Publish — usually only one per surface)
- **A small cluster of session controls** (autosave icon, theme toggle, account avatar) — icon-only when possible

Anything beyond this needs to *earn* its slot. The questions to ask before adding an element to the top bar:

1. Is this duplicative with what the sidebar shows? → Move it to the sidebar or remove it.
2. Is this a computed value contextual to the work (totals, counts, results)? → Move it into the content area (sticky summary above or below the form) OR into the sidebar's active-matter card where it sits with related context.
3. Is this a status indicator (autosave, sync, version)? → Use a single icon with tooltip, not full text. Only show full text if the page width genuinely has room AND nothing else in the top bar is competing for that visual weight.
4. Is this a brand element (logo, app name)? → The sidebar usually owns this. Don't repeat it in the top bar.

**The squint test:** if you can squint at the top bar and not immediately read the page name, primary action, and save state — there's too much in it. Pull things out until those three are unambiguous.

## Where things *should* live (not in the top bar)

| Element | Right home (not the top bar) |
|---|---|
| Active matter / project context (IDs, title, owner) | Sidebar "active matter" card |
| Computed totals or progress values | Sidebar matter card OR sticky summary bar above/below content |
| Multi-segment breadcrumb when sidebar already shows app hierarchy | Skip the duplicative segments — keep only the leaf (current page) |
| Long-form save state | Compress to a single icon with full text in tooltip |
| Notifications inbox | Right cluster, but as a `bell` icon button with popover, not inline text |
| User identity beyond avatar | Avatar button with popover menu, not inline name |
| Version label / environment tag (Staging, V24) | Sidebar near app name, not top bar |

## What earns a slot in the top bar (the default set)

- The current page name (leaf breadcrumb, max 2 segments)
- The primary call-to-action for this page (one button)
- Autosave status — as an **icon**, not text
- Theme toggle
- Account/avatar
- Hamburger (mobile only)

That's it. Anything else has to be justified by name before it goes in.

## The app shell layout
```
┌─────────────┬────────────────────────────┐
│             │  Top bar (sticky)          │
│   Sidebar   ├────────────────────────────┤
│   (sticky)  │                            │
│             │   Main content area        │
│             │   (≤1200px reading /       │
│             │    full-width data)        │
│             │                            │
└─────────────┴────────────────────────────┘
```

- **Sidebar** (optional — simple/shallow apps omit it and use the top bar alone; see `navigation-and-ia.md`): persistent on desktop (≥1024px), slide-in drawer below 1024px
- **Top bar**: sticky, persistent across pages, contains identifiers/breadcrumb (left) + status + actions (right)
- **Main**: width is content-aware, not a fixed cap. **Reading/forms** (forms, settings, detail, single-column flows) use `max-width: min(100%, 1200px)` so line length stays comfortable. **Data-dense surfaces** (tables, logs, dashboards, boards, monitoring) go **full-width** — `max-width: none` with side gutters (`--space-6`/`--space-8`) so they use the whole canvas but never touch the edge. Don't cap a wide table at 1200px. Either way: padded, scrolls within the viewport.
- Sidebar drawer overlay uses scrim + focus trap (see `disclosure-surfaces.md`)

## Top bar anatomy

**Left side (priority order for mobile collapse — last item drops first):**
1. Hamburger menu trigger (visible only below 1024px) — `ph-list` icon
2. App name / logo (optional, often handled by sidebar so safe to omit)
3. Identifier badge (e.g., `[Client · Matter]`) — pill, monospace, `--bg-page` background with 1px `--border-light` border
4. Breadcrumb / current page title
5. Status indicators (autosave, sync, version)

**Right side (priority order for mobile collapse — last item drops first):**
1. Primary action (Save, Publish, Export) — most important; use primary button styling
2. Secondary actions — icon buttons or secondary buttons
3. Theme toggle — icon button
4. User avatar / account menu — circular avatar or icon button with popover

## Breadcrumb patterns

Show only what's earned. Don't pad with placeholder hierarchy.

| Viewport | Treatment |
|---|---|
| Desktop (≥1024px) | Full breadcrumb with separators: `Brief Builder › Setup` |
| Tablet (768–1023px) | Drop identifier badge if present, keep breadcrumb: `Brief Builder › Setup` |
| Mobile (<640px) | Show only leaf (current page): `Setup` |

**Separator:** Phosphor `caret-right`, 14px, `--text-secondary`. Never use `>` or `/` as text characters — they don't kern correctly with the caps-tracked breadcrumb text.

**Wrap behavior:** breadcrumb segments use `white-space: nowrap` with `overflow: hidden; text-overflow: ellipsis` on each span. The breadcrumb itself never wraps to two lines.

**Accessibility:** wrap in `<nav aria-label="Breadcrumb">`; mark current page with `aria-current="page"`.

## Status indicators

Autosave, sync, version, unsaved-changes badges — all secondary information. They collapse aggressively on narrow viewports.

| Status | Desktop | Tablet | Mobile |
|---|---|---|---|
| Autosaved · 12 min ago | full text + leading dot | "Saved 12m" | `ph-cloud-check` icon |
| Syncing… | full text + spinner | "Syncing…" | `ph-arrows-clockwise` spinning |
| Unsaved changes | full text | "Unsaved" | `ph-circle-dashed` |
| Sync error | full text + retry icon | "Sync error" | `ph-warning-circle` in error color |
| Read-only | "Read-only" + lock | lock + "Read-only" | `ph-lock` icon |

**Rule for icon-only states:**
- Must have `aria-label` describing the full status
- Must have a tooltip on hover (desktop) and a tap-target detail (mobile)
- Status icons sit at 18–20px, color matches semantic (success/warning/error or `--text-secondary` for neutral)

**Never let status text wrap word-by-word** ("SAVED" / "·" / "12" / "MIN" / "AGO" on separate lines is broken — it means the spec didn't budget for this row's mobile collapse).

## Action area

- Primary action: full primary button per `_core-requirements.md` button spec
- Secondary actions: icon-only buttons (36×36) OR secondary buttons depending on text length
- **Maximum 2 visible action buttons on mobile** — extras go into a `ph-dots-three-vertical` overflow menu (popover from the right edge)
- Icon-only buttons require `aria-label`
- Theme toggle and avatar live separately from "this page's actions" — they're app-level, always visible
- Action button gap: `var(--space-2)` between icon buttons, `var(--space-3)` between full buttons

## Mobile collapse priority

When the viewport narrows, collapse content in this order — drop or compact items at the top of the list first:

1. Drop leading breadcrumb segments (keep only the leaf at <640px)
2. Compact status indicators (full text → abbreviated → icon-only)
3. Move tertiary actions into overflow menu
4. Hide identifier badges (the user knows what they're in)
5. App-level controls (theme, avatar) stay visible until absolute last
6. Primary action button never hides — it can become icon-only with `aria-label` at the very narrowest viewports

**Never let header content wrap awkwardly.** If a section can't fit elegantly on one line, hide it, compact it, or push it into an overflow menu. Word-by-word wrapping is always a layout bug.

## Hard mobile breakpoint rules for the top bar

These are not suggestions — they are the *default behavior* at each breakpoint. If your top bar isn't doing these, it's wrong.

**At ≤1024px (tablet and below):**
- Hamburger button visible on the left
- Drop the leading breadcrumb segments — keep only the current page name (e.g., `Brief Builder › Setup` becomes just `Setup`)
- Identifier badges (matter IDs, project codes) move into the sidebar's active-matter card; remove from top bar
- Long status pills ("Live · auto-calculating") compress to `--text-secondary` text without the pale fill, or to an icon

**At ≤768px (tablet portrait / large phone):**
- Status indicators become icon-only with tooltip (e.g., autosave → `cloud-check` icon, calculating → spinning `arrows-clockwise` icon)
- Secondary action buttons (SAVE DRAFT, EXPORT) collapse into a `dots-three-vertical` overflow menu — keep only the *one* primary action visible (GENERATE BRIEF, CONTINUE, etc.)

**At ≤640px (phone):**
- Page title can truncate with `text-overflow: ellipsis` if needed
- Primary action button label may abbreviate ("Generate brief" → "Generate") or become icon-only with `aria-label` — *but the primary action never hides entirely*
- Viewport indicator, environment tags, version labels — hide

**Universal rule across all viewports:** if the top bar reaches a point where it would wrap any element to a second line, the responsive strategy has already failed. Hide, compact, or move before you allow a wrap. Word-by-word wrapping ("LIVE / auto- / calculating") is never acceptable — it's the visible symptom of a missed collapse step.

**Decision recipe for any top bar:** for each element, apply *editing not scaling*:
- **Keep?** Only if it's the page title, primary action, or session control (theme/account)
- **Remove?** Anything duplicative with the sidebar (logo, breadcrumb ancestors)
- **Move?** Computed totals → sidebar matter card; secondary actions → overflow menu
- **Reshape?** Status pills → icons; "Save draft" → save icon; long page titles → ellipsis
- **Replace?** Long autosave text → cloud icon with tooltip

## Sticky header rules

- Top bar: `position: sticky; top: 0; z-index: 50` on the `<header>`
- Sidebar (desktop): `position: sticky; top: 0; height: 100vh; overflow-y: auto`
- Sidebar (mobile): `position: fixed` (drawer) — `transform: translateX(-100%)` when closed

**Critical gotcha:** sticky positioning breaks if you put `overflow-x: hidden` on `body`. Use `overflow-x: clip` on `html` instead — `clip` doesn't establish a scroll container. See `responsive-and-mobile.md` for the full constraint cascade.

## Content scroll vs page scroll

- **The PAGE scrolls** (html). Top bar is sticky and stays visible.
- **Inner scroll containers** (sidebar, modal body, sheet, table-shell) have their own `overflow: auto`.
- Don't nest scroll containers unless intentional — confuses scroll wheel and focus order.
- Add `scroll-padding-top` on `html` equal to the header height (~80px) so anchor jumps don't land behind the sticky header.

## Save state interactions

- Autosave silently in the background; status indicator reflects state
- On successful save: brief "Saved" toast OR just update the autosave indicator (the indicator IS the confirmation — don't double up)
- On save error: persistent inline alert with retry action; do not auto-dismiss
- Cmd/Ctrl+S triggers immediate save (good convention for power users)

## McDermott-specific tokens
- Top bar height: 56px (both themes, both viewports)
- Top bar padding: `var(--space-3) var(--space-7)` desktop, `var(--space-3) var(--space-4)` mobile
- Background: `var(--bg-surface)` with 1px bottom border in `var(--border-light)`
- Breadcrumb text: Sans 13pt, ALL CAPS, 10% letter-spacing, `var(--text-secondary)`
- Status text: Sans 13pt, sentence case, `var(--text-secondary)`
- Identifier badge: monospace 12pt, navy text on `var(--bg-page)` background, 1px `var(--border-light)` border, 2px radius

## Anti-patterns — Never Do This
- Header content wrapping word-by-word (always a layout bug — fix the collapse strategy)
- More than 2 visible action buttons on mobile (use overflow menu for extras)
- Full autosave text crammed into narrow mobile header (use icon)
- `body { overflow-x: hidden }` (breaks sticky — use `overflow-x: clip` on html)
- Multiple competing primary actions in the header (one primary, others secondary or in menu)
- Status indicators without an icon equivalent for mobile
- Header background that's transparent or matches `--bg-page` (need visual separation from content)
- Z-index conflicts with modal (z: 110) and scrim (z: 100) layers
- Breadcrumb separators as text characters (`>` `/`) — use Phosphor `caret-right`
- Sticky header without `scroll-padding-top` on html (anchor links land behind it)
- Hide the primary action entirely on mobile — make it icon-only with aria-label instead
- Cram 4+ text elements across the top bar (breadcrumb + status + total + buttons). The top bar should default to less, not more — move computed values to the sidebar or sticky summary, compress status to an icon, drop duplicative breadcrumb segments. If you have to squint to read the page name, the top bar is overloaded.

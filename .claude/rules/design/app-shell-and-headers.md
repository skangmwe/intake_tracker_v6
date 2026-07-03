---
name: McDermott App Shell & Headers
description: 'Use when designing application headers, top bars, app chrome, breadcrumbs, page titles, status indicators (autosave, sync, version), action toolbars, persistent application frames, or any layout containing sidebar + topbar + content.'
version: 1.0.0
---
# McDermott App Shell & Headers
The persistent frame around any application surface. Pairs with `navigation-and-ia.md`.

## Top bar minimalism — default to less
The top bar exists to anchor: where am I, what's saved, what's the primary action. Everything else lives elsewhere. A calm top bar has at most: **one** location indicator, **one** primary action, and a small icon cluster (autosave, theme, account). Anything beyond must earn its slot.

**The squint test:** if you can't immediately read the page name, primary action, and save state — there's too much in it.

## Where things should live (not in the top bar)
| Element | Right home |
|---|---|
| Active matter/project context (IDs, owner) | Sidebar "active matter" card |
| Computed totals or progress values | Sidebar matter card OR sticky summary above/below content |
| Multi-segment breadcrumb duplicating sidebar hierarchy | Keep only the leaf (current page) |
| Long-form save state | Icon with full text in tooltip |
| Notifications inbox | Right cluster, `bell` icon + popover |
| Version/environment label | Sidebar near app name |

## The app shell layout
```
┌─────────────┬────────────────────────────┐
│             │  Top bar (sticky)          │
│   Sidebar   ├────────────────────────────┤
│   (sticky)  │   Main (≤1200px reading /  │
│             │         full-width data)   │
└─────────────┴────────────────────────────┘
```
- Sidebar (optional — simple/shallow apps omit it and use the top bar alone): persistent ≥1024px, drawer below (see `navigation-and-ia.md`)
- Top bar: sticky, persistent across pages
- Main: width is content-aware, not a fixed cap. **Reading/forms** (forms, settings, detail, single-column flows) use `max-width: min(100%, 1200px)` so line length stays comfortable. **Data-dense surfaces** (tables, logs, dashboards, boards, monitoring) go **full-width** — `max-width: none` with side gutters (`--space-6`/`--space-8`) so they use the whole canvas but never touch the edge. Don't cap a wide table at 1200px. Either way: padded, scrolls within the viewport.

## Top bar anatomy
**Left (mobile collapse priority — last drops first):** hamburger (<1024px) · app name (often handled by sidebar) · identifier badge · breadcrumb / page title · status indicators.

**Right (mobile collapse priority — last drops first):** primary action · secondary actions · theme toggle · user avatar.

## Breadcrumbs
| Viewport | Treatment |
|---|---|
| Desktop ≥1024px | Full breadcrumb with `caret-right` separator |
| Tablet 768–1023px | Drop identifier badge; keep breadcrumb |
| Mobile <640px | Show only leaf (current page) |

Separator: Phosphor `caret-right`, 14px, `--text-secondary`. Never `>` or `/` as characters. Breadcrumb segments use `white-space: nowrap` + ellipsis; the breadcrumb itself never wraps. Wrap in `<nav aria-label="Breadcrumb">`; mark current with `aria-current="page"`.

## Status indicators (autosave, sync, version)
| Status | Desktop | Tablet | Mobile |
|---|---|---|---|
| Autosaved · 12 min ago | full text + leading dot | "Saved 12m" | `cloud-check` icon |
| Syncing… | text + spinner | "Syncing…" | `arrows-clockwise` spinning |
| Unsaved changes | full text | "Unsaved" | `circle-dashed` |
| Sync error | text + retry | "Sync error" | `warning-circle` in error color |
| Read-only | "Read-only" + lock | lock + "Read-only" | `lock` icon |

Icon-only states must have `aria-label`, tooltip on desktop, tap-target detail on mobile. **Never let status text wrap word-by-word** — that's the visible symptom of a missed collapse.

## Action area
Primary action: full primary button. Secondary actions: icon buttons OR secondary buttons. **Max 2 visible action buttons on mobile** — extras go into a `dots-three-vertical` overflow menu. Icon-only requires `aria-label`. Theme toggle and avatar are app-level, always visible. Gap: `--space-2` between icon buttons, `--space-3` between full buttons.

## Hard mobile breakpoint rules

**≤1024px:** hamburger visible · drop leading breadcrumb segments (keep leaf only) · identifier badges move to sidebar · long status pills compress to text or icon.

**≤768px:** status indicators become icon-only with tooltip · secondary action buttons collapse into overflow menu · keep ONE primary action visible.

**≤640px:** page title can truncate with ellipsis · primary action label may abbreviate or become icon-only with `aria-label` (but never hides entirely) · hide viewport indicators, environment tags, version labels.

**Universal:** if anything would wrap to a second line, hide/compact/move before allowing the wrap. Word-by-word wrapping is never acceptable.

**Decision recipe:** for each element, apply *editing not scaling* — keep (only page title, primary action, session controls) / remove (sidebar duplicates) / move (totals → sidebar; secondary actions → overflow) / reshape (status pills → icons) / replace (autosave text → cloud icon).

## Sticky header rules
- Top bar: `position: sticky; top: 0; z-index: 50`.
- Sidebar (desktop): `position: sticky; top: 0; height: 100vh; overflow-y: auto`.
- Sidebar (mobile): `position: fixed` drawer — `transform: translateX(-100%)` when closed.
- **Critical:** sticky breaks if `body { overflow-x: hidden }`. Use `overflow-x: clip` on html. See `responsive-and-mobile.md`.

## Content scroll vs page scroll
The PAGE scrolls (html); top bar stays sticky. Inner scroll containers (sidebar, modal body, sheet, table-shell) have their own `overflow: auto`. Add `scroll-padding-top` on html equal to header height (~80px) so anchor jumps don't land behind the sticky header.

## Save state
Autosave silently; status indicator reflects state. On success: brief "Saved" toast OR just update the indicator (don't double up). On error: persistent inline alert with retry — do not auto-dismiss. Cmd/Ctrl+S triggers immediate save.

## McDermott-specific
- Top bar height: 56px. Padding: `--space-3 --space-7` desktop, `--space-3 --space-4` mobile.
- Background: `--bg-surface` with 1px bottom border in `--border-light`.
- Breadcrumb text: Sans 13pt, ALL CAPS, 10% tracking, `--text-secondary`.
- Identifier badge: monospace 12pt, navy on `--bg-page`, 1px `--border-light`, 2px radius.

## Anti-patterns
- Header content wrapping word-by-word
- More than 2 visible action buttons on mobile · multiple competing primary actions
- Full autosave text in narrow mobile header
- `body { overflow-x: hidden }` (breaks sticky)
- Status indicators with no icon equivalent
- Header background transparent or matching `--bg-page`
- Breadcrumb separators as text characters (`>` `/`)
- Sticky header without `scroll-padding-top`
- Hide the primary action entirely on mobile (use icon-only)
- Cram 4+ text elements across the top bar

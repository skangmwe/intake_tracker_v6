---
name: McDermott Navigation & IA
description: 'Use when designing navigation, sidebars, top bars, breadcrumbs, tabs, mobile nav, drawers, hamburgers, command palettes, page hierarchy, or making decisions about information architecture and global navigation patterns.'
version: 1.0.0
---
# McDermott Navigation & Information Architecture
Where things live and how users move between them. Pairs with `disclosure-surfaces.md` for "how do I reveal this content."

## Global navigation decision matrix
Pick one. Don't combine without intent.
| Pattern | Use when |
|---|---|
| Top bar (desktop) | Shallow IA (≤7 sections), brand-forward or content-heavy products |
| Side nav (desktop) | Deep IA, dashboards, when persistent context matters |
| Bottom tabs (mobile) | ≤5 primary destinations, frequently switched |
| Drawer / hamburger (mobile) | Secondary destinations, deep IA, settings |
| Hybrid (tabs + drawer) | Modern default for most mobile apps |
| Command palette (⌘K) | Power-user supplement — never the only nav |

## Default to the lightest nav — most apps don't need a side nav
A side nav is for genuine depth (many sections, a dashboard/admin product, persistent cross-page context) — it is **not** the default frame. A simple or single-purpose app (a form, a wizard, a focused tool, a few pages) uses a **top bar** (lockup in the leading slot, up to ~7 links inline) or no global nav at all. Never add a sidebar by default or "for consistency": apps share identity through the lockup and tokens, not identical chrome — forcing the same sidebar everywhere makes apps look alike and eats canvas. Reach for a side nav only when the IA earns it; otherwise the lockup lives in the top-bar leading slot (see `application-lockup.md`).

## Persistent vs collapsible
Side nav is persistent above `--bp-lg` (1024px), drawer below. `--sidebar-w` (260px) expanded, `--sidebar-w-collapsed` (72px) collapsed. Collapse state persists per session (ideally per user).

### Desktop collapse — the icon rail
On desktop the user can reclaim canvas width by collapsing the sidebar to the 72px icon rail. For content-heavy apps this is expected, not optional.
- **Toggle:** a control pinned at the sidebar bottom (above the pinned profile) — `sidebar-simple` icon, "Collapse" label when expanded; the same control re-expands. User-driven only, and the state persists per user. Never hover-to-auto-expand.
- **Collapsed rail (72px):** each item shows its **icon only**, centered; labels and section headers hide; the lockup drops to the symbol (see `application-lockup.md`). Active item keeps its 3px left rail in `--accent-interactive`.
- **Labels on demand:** every rail icon needs an `aria-label` and a hover/focus tooltip — collapsing must not strip an item's accessible name.
- **Animation:** width transitions `--duration-base` `--ease-standard`; the content area reflows to fill. This is a push (layout), not an overlay — overlays are the mobile drawer's job.
- **Don't** collapse based on width alone (below 1024px convert to the drawer instead), and don't drop labels without tooltips.

## What belongs in sidebar nav (and what doesn't)
**Belongs:** distinct app sections (Dashboard, Reports), tools/reference, account destinations, a persistent "active matter" card at top, a pinned user-profile/account at bottom.

**Does NOT belong:** steppers/wizard step lists (see `steppers-and-wizards.md`), running totals or computed values (use sidebar matter card or sticky page summary), status indicators (top bar), tab-style content switchers, in-page filters.

The sidebar is *app-scoped* navigation. Anything scoped to a single flow lives in that page's canvas. If a multi-step flow is the entire purpose of a surface, it's acceptable to omit the sidebar there.

## Sidebar height — content never falls below the fold
Sidebar fits within the viewport vertically. If content exceeds height, it scrolls internally. Persistent content (user profile, account) stays pinned at the bottom. Same rule in the mobile drawer.

```css
.nav-sidebar { position: sticky; top: 0; height: 100vh; overflow-y: auto; display: flex; flex-direction: column; }
.nav-sidebar .nav-primary { flex: 1; min-height: 0; overflow-y: auto; }       /* min-height:0 allows shrinking */
.nav-sidebar .nav-pinned { flex-shrink: 0; border-top: 1px solid rgba(255,255,255,0.08); }   /* never shrinks */
```

## Mobile sidebar: ALWAYS a slide-in drawer
Below 1024px the sidebar **must** convert to a drawer:
- `position: fixed`, `top: 0; left: 0`, `height: 100vh`, `width: min(85vw, 320px)`
- Hidden by default with `transform: translateX(-100%)`
- Opens via hamburger in the top bar (`list` icon)
- Slides in with `--scrim` overlay + `backdrop-filter: blur(4px)` where supported
- Focus trap; Escape, scrim click, and link click all close; focus returns to hamburger
- Hamburger only renders below 1024px (use `.btn.hamburger-btn` compound selector to win specificity)

**Forbidden:** stack the sidebar above content vertically · hide it with no replacement · horizontal scrolling strip · drawer with no scrim · open from the right (left is universal mobile-nav convention).

## Active state — at least two indicators
Color shift to `--accent-interactive` **plus** weight, indicator bar (3px left rail), or background tint. Never rely on color alone.

## Nav item leading markers — pick ONE signal
Every nav item gets exactly **one** leading marker. Never combine number + icon (it reads cluttered).

- **Numbered** for sequential items (wizard steps, builder flow); **Icon** for categorical items (sections, settings groups); **Neither** when labels are self-recognizable.

In mixed sidebars, group under section labels ("BUILDER" with numbered items, "OUTPUTS" with icon items). Don't mix markers within a section.

## Tabs
Sibling content within a single section — never primary navigation. Max 5 tabs visible. Active tab: 2px bottom border in `--accent-interactive`. Keyboard nav (Left/Right arrows, Home/End). **Tabs scroll horizontally on narrow viewports — never wrap.** Set `overflow-x: auto` on the tab container, `flex-shrink: 0` on each tab.

## Breadcrumbs
Only for hierarchies 3+ levels deep. Flat hierarchies use the page title. Separator: Phosphor `caret-right` icon (not `>` as text). Current page is the last item, not a link.

## Search placement
Top bar (desktop), center or right — never buried. Mobile: icon in top bar, expands to full-width on tap. Command palette (⌘K) for deep navigable content.

## Scroll-spy active state (anchor nav / sidebar TOC)
When sidebar uses anchor links, the active-state spy must account for **both** `html { scroll-padding-top: X }` AND `section { scroll-margin-top: Y }`. After a fragment-jump click, the browser lands at `target.offsetTop − (X + Y)`. The spy threshold must be `≥ X + Y + slack`. With McDermott defaults (80 + 48), threshold ≥ 140. Anything smaller and the spy lands on the link ABOVE the clicked one. Always pair the spy with an **immediate `setActive` on click** so the user gets feedback before scroll completes.

## Mobile nav rules
Bottom tab bar ≥48dp tall. Active tab: icon + label, both colored. Drawer slides in from left with scrim. Hamburger (`list`) opens; `x` closes. Bottom tabs hide on scroll-down, return on scroll-up — never hide the drawer trigger.

## McDermott-specific
Sidebar uses `--bg-sidebar` (navy in both themes). Sidebar text is `--color-white` always. Top bar: `--bg-surface` with 1px bottom border in `--border-light`. Navigation links: `--font-mix` (Georgia), Initial caps, 16pt.

## Anti-patterns
- Tabs as primary navigation · more than 7 top-level nav items
- Active state by color alone · hide current location entirely
- Hamburger menu on desktop without strong reason
- Auto-collapse sidebar without remembering preference
- Combine number + icon in the same nav item
- Breadcrumbs for flat 1–2 level hierarchies
- Bottom tabs + persistent drawer + top bar simultaneously
- Disable keyboard navigation in tabs
- Scroll-spy threshold smaller than `scroll-padding-top + scroll-margin-top`
- Scroll-spy with no immediate `setActive` on click

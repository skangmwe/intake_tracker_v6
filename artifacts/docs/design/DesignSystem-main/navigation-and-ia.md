---
name: McDermott Navigation & IA
description: 'Use when designing or building navigation, sidebars, top bars, breadcrumbs, tabs, mobile nav, drawers, hamburgers, command palettes, page hierarchy, or making decisions about information architecture and global navigation patterns.'
version: 1.0.0
---
# McDermott Navigation & Information Architecture
Decisions about *where things live* and *how users move between them*. Pairs with `McDermott Disclosure Surfaces` for "how do I reveal this content."
## Global navigation decision matrix
Pick one. Don't combine without intent.
| Pattern | Use when |
|---|---|
| **Top bar (desktop)** | Shallow IA (≤7 top-level sections), brand-forward or content-heavy products |
| **Side nav (desktop)** | Deep IA, dashboard/admin products, when persistent context matters |
| **Bottom tab bar (mobile)** | ≤5 primary destinations, frequently switched between |
| **Drawer / hamburger (mobile)** | Secondary destinations, deep IA, infrequent items, settings |
| **Hybrid (bottom tabs + drawer)** | Modern default for most mobile apps — primary in tabs, secondary in drawer |
| **Command palette (⌘K)** | Power-user supplement to a primary nav — never the only nav |

## Default to the lightest nav — most apps don't need a side nav
A side nav is for genuine depth (many sections, a dashboard/admin product, persistent cross-page context) — it is **not** the default frame. A simple or single-purpose app (a form, a wizard, a focused tool, a few pages) uses a **top bar** (lockup in the leading slot, up to ~7 links inline) or no global nav at all. Never add a sidebar by default or "for consistency": apps share identity through the lockup and tokens, not identical chrome — forcing the same sidebar everywhere makes apps look alike and eats canvas. Reach for a side nav only when the IA earns it; otherwise the lockup lives in the top-bar leading slot (see `application-lockup.md`).

## Persistent vs collapsible
- Side nav is persistent above `--bp-lg` (1024px), collapsed to a drawer below.
- Use `--sidebar-w` (260px) when expanded, `--sidebar-w-collapsed` (72px) when collapsed.
- Collapse state must persist across pages (per session minimum, ideally per user).

### Desktop collapse — the icon rail
On desktop the user can reclaim canvas width by collapsing the sidebar to the 72px icon rail. For content-heavy apps this is expected, not optional.
- **Toggle:** a control pinned at the sidebar bottom (above the pinned profile) — `sidebar-simple` icon, "Collapse" label when expanded; the same control re-expands. User-driven only, and the state persists per user. Never hover-to-auto-expand.
- **Collapsed rail (72px):** each item shows its **icon only**, centered; labels and section headers hide; the lockup drops to the symbol (see `application-lockup.md`). Active item keeps its 3px left rail in `--accent-interactive`.
- **Labels on demand:** every rail icon needs an `aria-label` and a hover/focus tooltip — collapsing must not strip an item's accessible name.
- **Animation:** width transitions `--duration-base` `--ease-standard`; the content area reflows to fill. This is a push (layout), not an overlay — overlays are the mobile drawer's job.
- **Don't** collapse based on width alone (below 1024px convert to the drawer instead), and don't drop labels without tooltips.

## What belongs in sidebar nav (and what doesn't)

The sidebar is for **inter-section navigation** — traversing between distinct pages, tools, or settings within the app. It is *not* a status display, a stepper, a progress indicator, or a summary panel.

**Belongs in sidebar nav:**
- Distinct app sections / pages (Brief Summary, Dashboard, Reports)
- Tools and reference material (Reference library, Admin panel, Settings)
- Account / user-level destinations (Profile, Preferences)
- Persistent matter / project context (an "active matter" card pinned at the top — see `app-shell-and-headers.md`)
- A pinned user profile / account control at the bottom

**Does NOT belong in sidebar nav:**
- **Steppers / wizard step lists** — if the canvas has a stepper, the sidebar does not duplicate it. See `steppers-and-wizards.md` ("Steppers do NOT belong in sidebar nav").
- Running totals or computed values (these go in the active-matter card or as sticky page summary)
- Status indicators (autosave, sync) — those belong in the top bar
- Tab-style content switchers (those go in the canvas — see `disclosure-surfaces.md`)
- In-page filters or sort controls (those go inline with the content they filter)

**Why:** the sidebar is *app-scoped* navigation that persists across pages. Anything that's scoped to a single flow or page lives in that page's canvas, not in the global sidebar. Crowding the sidebar with flow-scoped content like steppers means the sidebar carries two competing mental models (app navigation + task progress) and forces the user to mentally reconcile them.

If a multi-step flow is the *entire* purpose of a surface (no other navigation exists), it's acceptable to omit the sidebar entirely on that surface — the canvas stepper alone is sufficient. Don't manufacture a sidebar just to host a duplicate stepper.

## Sidebar height & internal scroll — content must NEVER fall below the fold

The sidebar fits within the viewport vertically. If sidebar content exceeds viewport height, it scrolls *internally* — never spills below the visible area. Important persistent content (user profile, primary actions, account menu) stays *pinned* at the bottom regardless of nav length so it's always reachable.

**Required CSS pattern:**
```css
.nav-sidebar {
  position: sticky;          /* desktop */
  top: 0;
  height: 100vh;
  overflow-y: auto;          /* internal scroll if content exceeds height */
  display: flex;
  flex-direction: column;
}
.nav-sidebar .nav-primary {  /* the main nav list */
  flex: 1;
  min-height: 0;             /* allow shrinking so the pinned section stays visible */
  overflow-y: auto;
}
.nav-sidebar .nav-pinned {   /* user profile, account, persistent actions */
  flex-shrink: 0;            /* never shrinks; always visible */
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding: var(--space-3) var(--space-4);
}
```

**Forbidden patterns:**
- ❌ Sidebar content extending past the viewport with no scroll
- ❌ User profile (or any pinned element) being cut off below the fold
- ❌ Nav list overflow without `min-height: 0` on the scrolling container (the flex `min-height: auto` gotcha — same as the width gotcha)

Same rule applies in the mobile drawer: when the drawer is open, its internal scrolling region behaves identically. The pinned-bottom section (user profile) stays anchored even when the drawer is taller than the viewport.

## **Mobile sidebar pattern: ALWAYS a slide-in drawer, NEVER a stack-above-content**

Below 1024px viewport, the sidebar **must** convert to a slide-in drawer pattern:

- `position: fixed` at `top: 0; left: 0`, height `100vh`, width `min(85vw, 320px)`
- Hidden by default with `transform: translateX(-100%)`
- Opens via a hamburger button in the top bar (Phosphor `list` icon)
- When open: slides in from the left with a `var(--scrim)` overlay behind it (`backdrop-filter: blur(4px)` where supported)
- Focus trapped inside the drawer when open; Escape closes; clicking the scrim closes; clicking a nav link closes
- Focus returns to the hamburger button on close
- Sidebar background remains `var(--bg-sidebar)` (navy in both themes)
- Top bar gets a hamburger button only when viewport is below 1024px (use compound selector `.btn.hamburger-btn { display: none }` then unhide in the breakpoint to win specificity over `.btn { display: inline-flex }`)

**Forbidden mobile sidebar patterns:**

- ❌ Stack the sidebar *above* the main content as a vertical section (creates a long scroll, breaks the spatial model)
- ❌ Hide the sidebar entirely with no replacement (leaves users with no navigation)
- ❌ Show the sidebar inline as a horizontal scrolling strip (terrible for thumb reach and tab/section comprehension)
- ❌ Make the drawer take 100% width without a scrim (loses the "I can dismiss this by tapping outside" affordance)
- ❌ Open the drawer from the right (left is the universal mobile-nav convention; right is reserved for filter sheets and detail panels)

This pattern is non-negotiable. See `app-shell-and-headers.md` for the full drawer + hamburger implementation. See the showcase for working reference.
## Active state treatment
Indicate current location in **at least two ways**:
- Color shift to `var(--accent-interactive)` (blue light / teal dark)
- Plus weight, indicator bar (3px left rail), or background tint
Never rely on color alone — colorblind users will miss it.

## Nav item leading markers — pick ONE signal
Every nav item is allowed exactly **one** leading visual marker, in addition to its label. Never combine two competing markers (number + icon + text is three visual hits per row when one would do — it reads as cluttered).

| When to use a number | When to use an icon | When to use neither |
|---|---|---|
| Sequential items (step 1, 2, 3 in a wizard or builder flow) | Categorical items (different sections of an app, library entries, settings groups) | Text-only nav where the labels themselves are recognizable (most sidebar table-of-contents nav) |

**Rules:**
- Numbered nav items: drop the icon. The number is the marker.
- Icon nav items: drop the number. The icon is the marker.
- Mixed sidebars (some items sequential, some categorical): group them under section labels — "BUILDER" with numbered items, "OUTPUTS" with icon items — so the two patterns coexist clearly. Don't mix markers within a single section.
- Active state still uses the left rail / color shift / weight — that's the indicator of *which* item is selected, not the item's identifier.

**Wrong** — three competing markers per row:
```
[1] [📄] Setup
[2] [⚙️] Processing
[3] [👥] Review
```

**Right** — one marker per row:
```
1  Setup                  [📄] Brief summary
2  Processing             [📖] Reference
3  Review                 [🔒] Admin panel
```

The numbered group reads as a sequenced flow; the icon group reads as categorical destinations. Section labels ("BUILDER" / "OUTPUTS") tell the user how to interpret each cluster.
## Tabs
Tabs are for **sibling content within a single section** — never for primary navigation.
- Maximum 5 tabs visible. Beyond that, switch to side nav or split the page.
- Active tab uses 2px bottom border in `var(--accent-interactive)`.
- Tabs must be keyboard navigable (Left/Right arrows, Home/End).
- **Tabs scroll horizontally on narrow viewports — they never wrap.** Wrapping tabs onto a second row breaks the row metaphor and the active-state logic. Set `overflow-x: auto` on the tab container and `flex-shrink: 0` on each tab; style the scrollbar thin so it reads as overflow indication, not chrome.
## Breadcrumbs
- Use only for hierarchies 3+ levels deep. Flat hierarchies use the page title.
- Separator: `/` or Phosphor `caret-right` icon (not `>`).
- The current page is the last item, not a link.
## Search placement
- Top bar (desktop) — center or right of nav, never buried.
- Mobile — icon in top bar, expands to full-width input on tap.
- Command palette (⌘K) — for product surfaces with deep navigable content.
## Scroll-spy active state (anchor nav / sidebar TOC)
When the sidebar nav uses anchor links (`href="#section-id"`), the active-state spy must account for **both** `html { scroll-padding-top: X }` AND `section { scroll-margin-top: Y }`. After a fragment-jump click, the browser lands at `target.offsetTop − (X + Y)`, NOT `target.offsetTop − X`.

If the spy uses `if (section.offsetTop <= scrollY + threshold)` to decide active state, `threshold` must be `≥ X + Y + small slack`. With McDermott defaults (`X = 80`, `Y = 48`), threshold should be ~140. Anything smaller and the spy lands on the link ABOVE the clicked one because the target's offsetTop is just past the threshold.

Always pair the spy with an **immediate `setActive` on click** so the user gets active-state feedback before any scroll completes. Don't rely on the scroll listener to settle.

## Mobile nav rules
- Bottom tab bar ≥48dp tall. Active tab uses icon + label, both colored.
- Drawer slides in from the left, overlays content with scrim.
- Hamburger icon (Phosphor `list`) opens drawer; X (Phosphor `x`) closes.
- Bottom tabs hide on scroll-down, return on scroll-up — never hide drawer trigger.
## McDermott-specific
- Sidebar uses `var(--bg-sidebar)` (navy). Sidebar text is `--color-white` always (sidebar is theme-stable like other dark surfaces).
- Top bar uses `var(--bg-surface)` with a 1px bottom border in `var(--border-light)`.
- Navigation links use `--font-mix` (Georgia), Initial caps, 16pt — per the McDermott Links spec.
## Anti-patterns — Never Do This
- Use tabs as primary navigation (it scales poorly past 5)
- More than 7 top-level nav items (group or move to secondary)
- Indicate active state with color alone
- Hide the current location entirely (always visible somewhere)
- Use a hamburger menu on desktop without a strong reason
- Auto-collapse sidebar without remembering user preference
- Combine number + icon + label in the same nav item (pick one marker — the number for sequenced items, the icon for categorical items, never both)
- Use breadcrumbs for flat 1-2 level hierarchies (visual noise)
- Combine bottom tabs + persistent drawer + top bar on mobile (pick one primary)
- Disable keyboard navigation in tab components
- Scroll-spy threshold smaller than `scroll-padding-top + scroll-margin-top` — fragment-jump lands just short of the target's offsetTop, so `.active` lands on the section above the clicked one
- Scroll-spy that only updates on scroll (no immediate-set on click) — the user sees the wrong link highlighted for a beat after every click

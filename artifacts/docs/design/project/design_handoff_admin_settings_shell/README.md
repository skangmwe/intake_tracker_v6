# Handoff: Admin section → grouped settings pattern (app shell)

## Overview
This handoff covers a change to the **persistent left sidebar (app shell)** of the AI Solutions Tracker — the chrome that wraps every screen. The flat six-item **Admin** section was replaced with **two grouped "settings pages" entries** (Workspace and Platform), each of which opens its own **secondary side-nav** of settings pages in the canvas. Because the sidebar is the shared shell, this change applies to every screen in the app.

Only the Admin section changed. Everything above it is unchanged and must stay so: the McDermott lockup, the workspace switcher, the **Workspace** nav group (Home, Requests, Dashboards), the **Reference** group (Feature Catalog, Toolkit), the collapse control, and the pinned account area in the top bar.

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype showing the intended look and behavior, not production code to copy line-for-line. The task is to **recreate this design in the target codebase's existing environment** (React, Vue, etc.) using its established components, routing, and state patterns. If no environment exists yet, choose the most appropriate framework and implement there. The prototype is a single Design Component (`AI Solutions Tracker.dc.html`) built on the **McDermott Design System**; use the equivalent components/tokens in your codebase (McDermott `NavItem`, `Button`, `Card`, color/spacing/radius tokens).

## Fidelity
**High-fidelity.** Final colors, typography, spacing, iconography (Phosphor, Regular weight), and interaction behavior are all specified per the McDermott Design System. Recreate pixel-faithfully using the codebase's McDermott primitives.

## Screens / Views

### 1. App shell — left sidebar, Admin section (changed)
- **Purpose:** Global navigation. The Admin section now surfaces two *section-landing* entries instead of a flat list of admin pages.
- **Layout:** Navy sidebar (`--bg-sidebar`), 260px expanded / 72px collapsed rail, sticky full-height with internal scroll and a pinned foot. Sections are stacked, each with an ALL-CAPS section label followed by a `<nav>` of `NavItem` rows.
- **Admin section contents (the only change):**
  - Section label: **ADMIN**
  - `NavItem` — **Workspace**, leading icon `gear` (Phosphor `ph-gear`). Active when the current screen is Workspace settings.
  - `NavItem` — **Platform**, leading icon `shield-check` (Phosphor `ph-shield-check`). **Rendered only when the current user is a platform admin.** Active when the current screen is Platform settings.
  - Each is a single row with exactly **one leading marker (the icon)** — never icon + number. Visual treatment (row height ~45px, hover flips text + rail to `--accent-interactive`, active shows the 3px left rail + color + weight) is identical to the existing Workspace/Reference `NavItem`s.
  - On the 72px collapsed rail, both show icon-only with a tooltip (`title`: "Workspace settings" / "Platform settings").

### 2. Settings surface (new) — secondary side-nav + content
- **Purpose:** Selecting a group lands the user on that group's settings surface. A secondary side-nav lists the group's settings pages; the content panel shows the active page.
- **Layout:** Standard reading canvas capped at `min(100%, 1200px)`, centered, padding `--space-6` top / `clamp(16px,4vw,32px)` sides / `--space-8` bottom.
  - **Header block** (column, gap `--space-2`): eyebrow (ALL CAPS, 13px, 600, letter-spacing 0.08em, `--text-secondary`) reading "WORKSPACE SETTINGS" / "PLATFORM SETTINGS"; H1 (Georgia `--font-mix`, 32px, weight 400) = the active page label; subtitle (13px, `--text-secondary`) = the active page description.
  - **Body row** (flex, `flex-wrap: wrap`, gap `--space-6`, align items flex-start):
    - **`<aside>` secondary side-nav** — width 236px, `flex-shrink: 0`, sticky at `top: calc(56px + var(--space-4))`, column of anchor links (gap 2px). Each link: min-height 40px, padding `--space-2 --space-3`, 3px left border, `border-radius: 0 2px 2px 0`, 14px text. Text-only (no leading icons in the sub-list — labels are self-explanatory, per the nav spec). `aria-current="page"` on the active link.
    - **Content column** — `flex: 1 1 340px; min-width: 0`, gap `--space-6`. Renders either the Lifecycle & gates editor (see below) or a generic settings panel.
  - **Generic settings panel:** a `Card` (2px radius, 1px `--border-light`, padding `--space-5`) containing a list of setting rows. Each row: 24px leading Phosphor icon (`--icon-default`) + a title (15px, 600) / description (13px, `--text-secondary`) stack + a secondary `Button` (size sm) on the right. A 12px `--text-secondary` footnote closes the card.
- **Active-page indication (≥2 cues, never color alone):** color shift to `--accent-interactive`, font-weight 600, and a 3px left rail in `--accent-interactive` plus an 8%-accent background tint. Inactive: `--text-secondary`, weight 400, transparent rail/background.

### Settings page inventory
**Workspace group** (default landing page = Users & access):
1. **Users & access** — Members (12 people / 5 roles) · Roles & permissions · Access requests (2 pending).
2. **Fields & objects** — Field library (18 definitions) · Objects (Requests / Tasks / Attachments).
3. **Views & dashboards** — Saved views (6 shared / 3 private) · Dashboard layouts (2).
4. **Lifecycle & gates** — the full existing lifecycle editor (Lifecycles, Stages, Gates, Approver teams). This is the prior S32 admin screen, now nested here.
5. **Announcements** — Active announcements (1 pinned) · History (14).
6. **Import & export** — Import requests (CSV/Excel) · Export data.
7. **Audit log** — Recent activity (238 events / 30 days) · Filters.

**Platform group** (default landing page = Fields):
1. **Fields** — Global fields (9 inherited by all workspaces).
2. **Crossing map** — Crossing rules (5 active).
3. **Access** — SSO & sessions (SAML, 8-hour) · Admin grants (4).
4. **Role labels** — Role catalog (Analyst · Manager · Approver · Viewer · GCO).
5. **Workspaces** — Active workspaces (AI Solutions hub · Litigation · M&A).
6. **Audit** — Platform activity (all workspaces / 90 days).

## Interactions & Behavior
- Clicking **Workspace** → sets screen to Settings, group = workspace, active page = Users & access, closes the mobile drawer, scrolls to top.
- Clicking **Platform** → screen = Settings, group = platform, active page = Fields, closes drawer, scrolls to top. (Only reachable when the user is a platform admin.)
- Clicking a **secondary side-nav** link → switches the active settings page (group unchanged), closes drawer, scrolls to top; the clicked link becomes active (3 cues).
- The **Lifecycle & gates** page carries all its existing editing behavior (add/remove lifecycles, stages, gates, approver slots and team members). Nothing about that editor changed except where it lives.
- Top-bar title reflects the active settings page label.
- Generic-page action buttons are stubs (no-op) in the prototype — wire to real destinations in the app.
- **Responsive:** below 1024px the whole sidebar becomes the slide-in drawer (unchanged behavior). In the settings body, the row wraps so the 236px secondary nav stacks above the content column when space is tight.

## State Management
Prototype state added (adapt to your router/store):
- `screen: 'settings'` — the active top-level surface (alongside existing `home`/`requests`/`detail`/`intake`/`dashboard`).
- `settingsGroup: 'workspace' | 'platform'` — which group is open.
- `settingsPage: <pageKey>` — active settings page within the group.
- `platformAdmin: boolean` — gates visibility of the Platform entry (prototype default `true` to demonstrate it).
- A static catalog (`SETTINGS_GROUPS`) maps each group to its label, eyebrow, and ordered pages; each page has `{ key, label, desc, footnote, rows[] }`. The lifecycle page has no `rows` — it renders the dedicated editor instead.
- In a real app, prefer nested routes: `/settings/workspace/:page` and `/settings/platform/:page`, with the secondary nav derived from the group's page list and the active state from the route param. Guard the platform routes/nav on the platform-admin claim.

## Design Tokens
- **Accent / active:** `--accent-interactive` (blue `#0018F2` light / teal `#00E2C1` dark). Active tint: `color-mix(in srgb, var(--accent-interactive) 8%, transparent)`.
- **Sidebar:** `--bg-sidebar` (navy `#000042`, theme-stable), white text.
- **Text:** `--text-primary`, `--text-secondary`. **Icons:** `--icon-default`.
- **Borders:** 1px `--border-light` structural; 3px left rail for active nav (accent).
- **Radius:** 2px everywhere here (`0 2px 2px 0` on the rail links); pills 999px (not used in this surface).
- **Spacing:** 4px grid via `--space-*` (2=8, 3=12, 4=16, 5=24, 6=32, 8=64).
- **Type:** system sans for UI/body; Georgia (`--font-mix`) for the H1/card titles. Eyebrows/labels ALL CAPS, 0.08em tracking. H1 32/400, row title 15/600, body 14, caption 12–13.
- **Icons:** Phosphor, Regular weight — `gear`, `shield-check` (sidebar), plus per-row icons (`users`, `identification-badge`, `key`, `textbox`, `list-dashes`, `stack`, `chart-bar`, `megaphone`, `clock-counter-clockwise`, `upload-simple`, `download-simple`, `scroll`, `funnel`, `graph`, `lock-key`, `buildings`, `pencil-simple`, `sliders-horizontal`, `plus`, `arrow-right`, `user-plus`).

## Assets
No image assets. Icons are Phosphor (Regular) via the McDermott icon convention. The McDermott M-in-circle lockup is the design system's inline SVG (unchanged).

## Files
- `AI Solutions Tracker.dc.html` — the full prototype (all screens + the updated app shell). The Admin nav is near the top of the template; the settings surface is the `isSettings` block; the logic lives in `SETTINGS_GROUPS`, `settingsVals()`, `settingsTitle()` and the wiring in `renderVals()`.
- `support.js` — the runtime the prototype was authored against (reference only).
- The prototype depends on the McDermott Design System bundle (loaded from `_ds/…` in the original project). Open the copy in the original project to run it; this bundle is documentation.

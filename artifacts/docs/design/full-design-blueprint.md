# Full Design Blueprint — AI Solutions Tracker

*Canonical planning document. Read alongside [`solution-requirements.md`](../product/solution-requirements.md) and [`ai_solutions_tracker_build_spec_final.md`](../dev/ai_solutions_tracker_build_spec_final.md). This blueprint captures what is prototyped and what is saved for build; the build spec governs implementation where the prototype does not.*

**Reconciled with prototype on 2026-07-03, from manually placed archive.** The prototype at `artifacts/docs/design/project/AI Solutions Tracker.dc.html` is a single-file rendering of all prototyped screens; the build reads it directly for visual truth. Changelog provenance is tagged `[from changelog: "<line>"]` on the rows and sections it drove.

---

## At a glance

| | |
|---|---|
| **Product** | AI Solutions Tracker — a multi-workspace request-intake-and-delivery platform for the AI Solutions team at McDermott Will & Schulte |
| **Prototyped screens** | 7 of 42 |
| **Directions per screen** | 1 (one confident answer) |
| **Demo persona** | AI Solutions Analyst — the daily user. Secondary personas: PG requestor (S3), AI Solutions Manager (S6), Workspace admin (S31) |
| **Platform** | Web, responsive (light + dark). No native mobile app. |
| **Design system** | McDermott — see `.claude/rules/design/_core-requirements.md` and the reference `mws-design-system-showcase.html` |
| **Prototype archive** | `artifacts/docs/design/project/AI Solutions Tracker.dc.html` (single-file `.dc.html` prototype) |

## Core flow (the prototype walkthrough)

1. **PG requestor opens the [Intake form (S3)](#s3-intake-form)** in their workspace. As they type Name and Description, the always-on Similar requests panel on the right surfaces up to three likely matches. They dismiss, link as `related`, or continue and submit. Client number appears as a revealed block when Dept/PG/Client = Client. A live-computed Priority score widget shows the formula alongside three 1–5 sliders. Inline validation (what happened → why → how to fix) fires on submit; on success a new record is minted and the user lands on the Requests list.
2. **Submit lands them on their [Requests list (S2)](#s2-requests-list)** with the newly-minted record visible. Aging tint on rows (pale-gold due-soon, pale-orange overdue) conveys SLA state at a glance. Saved-view picker + Export view sit in the view bar. Per-column funnel filters offer type-aware inputs (comparator shorthand `>5`, from/to dates, substring, multi-select checkbox with per-value counts). Row click opens the record.
3. **Opening a record shows [Record detail (S4)](#s4-record-detail)** — the sticky compact lifecycle stepper up top, three tabs (**Intake / Tasks & gates / Activity**), and a right side panel (**Relationships / Attachments / Watchers**). The Intake tab is editable — fields render as live form controls with an autosave "All changes saved" indicator on the tab row. The Tasks & gates tab groups tasks by build phase (collapsible headers on navy) with tab composers (Add task / Add bundle segmented control) in a gray-boxed panel; per-task Notes & decisions expandable. Gates render inline within their target phase group.
4. **An escalated record shows [Escalated record (S5)](#s5-escalated-record)** — same layout as S4 with two additions: the header carries an **"Escalated · [origin]"** status pill (Origin is not repeated in the meta strip), and the Intake tab shows crossing fields with a pale-gold **"⇄ Crossed · locked on PG"** marker (fully editable AI-side; the lock is conceptual and applies on the PG side only). A slim mirror note at the top of the Intake tab summarizes provenance (shared ID · crossed-fields-locked-on-PG · PG follows via status mirror · Deploy/Post-launch → "Deployed" on PG until closure). **There is no standalone three-part bridge panel** — the prototype iteration replaced it with the inline treatment [from changelog: "Replaced the collapsible escalation-bridge panel with an Intake tab on Request detail"].
5. **The Analyst's [Home (S1)](#s1-home)** is where every user lands after sign-in. Sidebar-shell layout with the McDermott lockup + workspace switcher at the top. Top bar: workspace search (records only, max 6 results — global comment/attachment search stays save-for-/build), notification bell, theme toggle (real product control, persisted), account avatar. Home body: pinned-announcement strip, then four panels — **Needs your decision · Your work today (urgency-ordered) · Since you were last here · New to triage**. "Pin as home" affordance next to the page heading.
6. **The Manager's [AI dashboard (S6)](#s6-ai-dashboard)** — four equal-width tiles in Row 1 (Pipeline by stage segmented bar with two-column legend · Escalations this quarter big-number + delta + per-origin summary · Unassigned past Intake big-number + per-Dept/PG/Client breakdown · Closures this quarter by outcome), Row 2 full-width Dept/PG/Client × stage heatmap (with surfaced "— (unset)" row), Row 3 embedded records grid with Export view. Drill-through is live everywhere — every tile, segment, and heatmap cell filters the embedded grid.
7. **The admin's [Lifecycle & gates (S31)](#s31-lifecycle--gates)** (sidebar → Admin → Lifecycle & gates) is where the workspace's lifecycle and gate machinery is configured. Stages section shows the six-stage lifecycle as numbered circles with a gate icon marking transitions that require approval. Gates section is a live editor — each gate has an editable name, from→to transition selects, and an **approver-slot list identifying teams only** (role label + "N eligible" count + remove), with AND-join note. A **Approver teams** section below the gates lists the members of each role label as editable chips (add / remove). Rejection resurfacing: a rejected slot reads "Changes requested · signer · time" and exposes a **Re-request approval** button. [from changelog: "Lifecycle & gates admin screen (S32)"; "Gates identify teams, not individuals"]

## What's in and why

| ID | Name | Value | Uncertainty | Why in prototype |
|---|---|---|---|---|
| S1 | Home | 5 | 4 | Novel composition of viewer-scoped queries (needs your decision / today / catch-up / new-to-triage / announcements) — sets the daily rhythm. |
| S2 | Requests list | 5 | 3 | Day-to-day working surface. In-list scroll, aging tint, per-column funnel filters, two-layer saved views, resizable columns, long-text wrapping — several specific §22 rules that needed to feel right. |
| S3 | Intake form | 5 | 4 | First user touch. Two-column with always-on Similar requests nudge is the duplicate defense and the riskiest UX call. |
| S4 | Record detail | 5 | 3 | Where the work happens. Compact sticky stepper + three tabs (Intake / Tasks & gates / Activity) + side panel. Tasks grouped by build phase with collapsible headers; typed per-task fields (URL / Text / Number / Date / Select / Checkbox) and task bundle templates emerged during iteration. |
| S5 | Escalated record | 5 | 5 | ★ Highest uncertainty in the product. Iteration ★★ collapsed the three-part bridge visualization into inline crossed-field markers + a slim mirror note on the Intake tab — the prototype's decisive answer to "how do we surface bridge provenance without dominating the surface" [from changelog: "Replaced the collapsible escalation-bridge panel with an Intake tab (Stephanie)"]. |
| S6 | AI dashboard | 4 | 3 | Manager's decision surface. Final layout is four uniform tiles + full-width heatmap + records grid (replacing the mixed KPI+bar layout the brief specified) [from changelog: "Dashboard layout — uniform tiles (per attached reference)"]. |
| S31 | Lifecycle & gates | 4 | 3 | Added during prototype iteration. Team-only approver-slot model (with an Approver teams membership section) and rejection follow-up (Changes requested chip + Re-request approval) needed a real surface to be legible [from changelog: "Lifecycle & gates admin screen (S32) + rejected-gate follow-up"; "Gates identify teams, not individuals"]. |

## What's saved for /build — brief

35 screens across 8 conceptual groupings: **Entry / nav** (2) · **Feature Catalog** (5) · **Other dashboards** (4) · **Bridge & Copy** (2) · **Notices** (4) · **Auxiliary record surfaces** (5) · **Workspace admin** (4 — one less than the original blueprint since S31 was promoted) · **Platform admin** (6) · **Edge states** (3). Full per-screen specs in [Save for /build screen details](#save-for-build-screen-details).

## Skill settings used

- **screen_budget:** 6 (default). The prototype went beyond budget (7 rendered) during iteration by adding S31 Lifecycle & gates. This is codified rather than reverted — the approved artifact wins.
- **directions:** 1 per screen (default, unmodified).
- **variant_exploration:** off (default). ★ S5 Escalated record was the highest-uncertainty candidate. Instead of variant exploration, iteration converged on a single decisive answer (inline crossed-field markers replacing the bridge panel).

## Open questions

1. **"Relationships" side-panel label** — the changelog notes alternatives were offered: Related records, Linked records, Connections, Related items — awaiting confirmation on final wording. Blueprint uses "Relationships" per the prototype's current state.
2. **Team-only approver-slot model in the build spec.** The prototype settled on team-only slots; the build spec (§7.2) allows both team slots and named-individual slots. Confirm at architecture review whether the team-only pattern is the final spec or the named-individual option remains available. `[PENDING — reconcile with build spec §7.2]`.
3. **Global search across comments and attachment filenames (S27) confirmed save-for-/build.** The top-bar workspace search is records-only; the full global search per build spec §9.5 stays deferred.
4. **Do dark-mode variants need any adjustment?** Assumed the prototype's theme toggle handles both — the build ports both light and dark treatments directly from the prototype.

---

## Full screen map — master table

*Every screen. Columns: ID · Name · Role · Contains · Connects-to · Tag · V · U · Source · **Prototype source** · **App route / component**.*

**Prototype source** points to the file (and, where applicable, the section identifier or on-screen name) each in-scope screen should be visually diffed against. Save-for-/build screens with no prototype presence have a blank Prototype source — visual review skips them. **This column is a navigation aid, not a source of truth — it tells a reviewer where to look, not what to build.** **App route / component** is filled in by the build pipeline.

Platform is **Web (responsive)** for every screen — omitted from the table to save width.

| ID | Screen | Role | Contains | Connects to (action) | Tag | V | U | Source | Prototype source | App route / component |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 | Home | Analyst | Pinned-announcement strip · four panels (Needs your decision · Your work today · Since you were last here · New to triage) · Pin-as-home affordance · sidebar shell with lockup + workspace switcher · top bar (workspace search · bell · theme toggle · avatar) | S2 (Open requests) · S3 (New request) · S4 (Open record) · S6 (Open dashboard) · S31 (Open admin) | **Prototype** | 5 | 4 | requirement | `project/AI Solutions Tracker.dc.html` — Home | |
| S2 | Requests list | Analyst | Full-width data grid · saved-view picker (Shared: All open / Unassigned / Due this week — Personal: My requests) · active-filter pills + Clear all · Export view · Create request · resizable columns with drag handles · in-list scroll · aging tint (pale-gold due-soon, pale-orange overdue) · per-column funnel filters · Repo URL column (task-field rollup example) · 25 rows per page · monospace record count | S3 (Create request) · S4 (Open record) · S5 (Open escalated) | **Prototype** | 5 | 3 | requirement | `project/AI Solutions Tracker.dc.html` — Requests | |
| S3 | Intake form | PG requestor | Four numbered sections (Intake · Value mapping · Solution details · Triage) · paired two-column rows · Client number revealed when Dept/PG/Client = Client · Priority Score widget (3× 1–5 sliders + live-computed score + formula) · always-on Similar requests panel (right, sticky) · Submit vs Save draft · inline validation (what+why+how) · optional-marker convention (no `*`) | S4 (Submit) · S2 (Save draft) | **Prototype** | 5 | 4 | requirement | `project/AI Solutions Tracker.dc.html` — New request | |
| S4 | Record detail | Analyst | Breadcrumb ("Requests › [ID]") · Header (mono ID + status pills + name) · compact meta strip (Display Status · Assigned Analyst · Priority Score · Due Date · **Submitted**) · sticky compact lifecycle stepper (24px circles on continuous track) · tabs **Intake / Tasks & gates / Activity** · Intake tab: editable form controls with autosave indicator on tab row · Tasks & gates tab: tasks grouped by build phase (collapsible headers on navy) · task bundle templates · per-task typed structured fields (URL/Text/Number/Date/Select/Checkbox) · per-task Notes & decisions · gates rendered inline within their target phase group with AND-join and inline approve/reject · side panel **Relationships / Attachments / Watchers** | S2 (Back to list) · linked-record cross-nav | **Prototype** | 5 | 3 | requirement | `project/AI Solutions Tracker.dc.html` — Request detail (non-escalated variant) | |
| S5 | Escalated record | Analyst | Everything S4 shows, plus: **"Escalated · [origin]" status pill** in the header (Origin only here, not in meta strip) · slim mirror note at top of Intake tab (shared ID · crossed-fields-locked-on-PG · PG follows via status mirror · Deploy/Post-launch → "Deployed" on PG until closure) · pale-gold **"⇄ Crossed · locked on PG"** marker on each crossing field (fully editable AI-side) · Approve/Reject pattern in Tasks & gates uses the pending-slot "Select your name" dropdown per §31's team-only approver model | S2 (Back to list) | **Prototype** | 5 | 5 | requirement | `project/AI Solutions Tracker.dc.html` — Request detail (escalated variant, e.g. REQ-0977 / REQ-1042) | |
| S6 | AI dashboard | Manager | Full-width surface with side gutters (not 1200px reading cap) · **Row 1 (four equal tiles):** Pipeline by stage (segmented bar + two-column legend + counts) · Escalations this quarter (big number + delta vs prior quarter + per-origin summary) · Unassigned past Intake (big number + per-Dept/PG/Client breakdown) · Closures this quarter (bar breakdown by Outcome) · **Row 2:** Requests by Dept/PG/Client × stage heatmap (full width; "— (unset)" row surfaced; em-dash for zeros) · **Row 3:** embedded records grid with Export view (owns its own scroll, sticky gray header, drill-through pills) · **Pin-as-home** affordance next to title | S2 (Drill to list) · S4 (Open record from grid) | **Prototype** | 4 | 3 | requirement | `project/AI Solutions Tracker.dc.html` — Dashboard | |
| S31 | Lifecycle & gates | Workspace admin | **Stages section:** six-stage lifecycle as numbered circles on a continuous track with a gate icon marking transitions that require approval · **Gates section:** live editor — each gate has editable name, from→to transition selects, and an approver-slot list identifying **teams only** (role label + "N eligible" count + remove), AND-join note · seeded with QA-readiness gate (Build→QA) and Post-launch-readiness gate (Deploy→Post-launch) · add/remove for gates and slots · **Approver teams section:** members of each role label (AI Solutions Manager · GCO · InfoSec · PG/Dept Lead · Data Privacy) as editable chips with add/remove · rejected-slot resurfacing: "Changes requested · signer · time" + **Re-request approval** button | (admin-local) | **Prototype** | 4 | 3 | requirement | `project/AI Solutions Tracker.dc.html` — Lifecycle & gates | |
| S7 | Sign in | All roles | SSO redirect handoff | S1 (SSO success) | Save for /build | 2 | 1 | inferred-infrastructure | — | |
| S8 | Workspace switcher | All roles | Bordered control in sidebar directly under lockup showing current workspace + caret · popover menu "Your workspaces" listing hub + PGs · collapses to icon-only building button on the 72px rail. *A stub of this control appears in every prototyped sidebar; the full switching flow and admin-side workspace management stay save-for-/build.* [from changelog: "Announcements → bell; workspace switcher"] | S1 (Switch) | Save for /build | 3 | 2 | inferred-infrastructure | — (stub visible in every prototyped screen's sidebar) | |
| S9 | Feature catalog | Analyst | List of Features, filters, saved-view picker, Add-to-catalog affordance | S10 (Open feature) · S11 (Gallery view) | Save for /build | 4 | 3 | requirement | — | |
| S10 | Feature detail | All roles | Fields, attachments (visuals), sourced-from links, how-to-reuse, demo/repo URLs | S9 (Back to catalog) | Save for /build | 3 | 2 | requirement | — | |
| S11 | Feature gallery | All roles | Card view with attachment thumbnails, filters, tap to open | S10 (Open feature) | Save for /build | 4 | 3 | requirement | — | |
| S12 | Feature dashboard | Firm-wide viewer | KPI tile · bar breakdown by type · bar breakdown by tech/stack · records grid (Published only) | S9 (Browse catalog) | Save for /build | 4 | 2 | requirement | — | |
| S13 | Add to catalog | Analyst | Prefilled Feature draft (from source Request) · edit fields · submit | S9 (Save feature) | Save for /build | 3 | 2 | requirement | — | |
| S14 | Workload dashboard | Manager, Analyst | Open records per analyst (bar) · Unassigned KPI · Pending sign-off KPI · Median time-to-first-triage (KPI-with-trend) · Aging in stage (histogram) · records grid | S2 (Drill to list) | Save for /build | 4 | 3 | requirement | — | |
| S15 | PG starter dash | PG admin, member | Requests by Dept/PG/Client · Escalation status KPI · records grid | S2 (Drill to list) | Save for /build | 3 | 2 | requirement | — | |
| S16 | Dashboard viewer | Viewer | One bound dashboard as the entire surface — no rail, no drill-through | (none) | Save for /build | 3 | 2 | requirement | — | |
| S17 | Dashboards list | Member, admin | List of dashboards visible to the viewer, with audience markers | S6 (Open default) · S14 (Open workload) · S12 (Open catalog) | Save for /build | 3 | 2 | inferred-infrastructure | — | |
| S18 | Escalate modal | Analyst | Confirm-and-lock: commit pending edits · confirm ID adoption · summary of what will lock | S5 (Confirm escalation) | Save for /build | 4 | 3 | requirement | — | |
| S19 | Copy modal | All roles | Include attachments toggle · optional link-back type (`related` / `re-pursuit-of`) · Cancel/Continue | S3 (Prefilled draft) | Save for /build | 3 | 2 | requirement | — | |
| S20 | Bell centre | All roles | Popover from top-bar bell — Notifications + Announcement history (two stubs visible in prototype's bell popover; full centre is save-for-/build) | S4 (Open record) · S21 (Open announcement) | Save for /build | 3 | 2 | requirement | — (stub visible in every prototyped screen's top bar) | |
| S21 | Announcement detail | All roles | Title, body, audience, published/expiry, author | S22 (Back to list) | Save for /build | 2 | 1 | requirement | — | |
| S22 | Announcements list | All roles | Browsable history of Announcements | S21 (Open announcement) | Save for /build | 2 | 1 | requirement | — | |
| S23 | Manage announcements | Admin | Create / edit / publish / retire · audience picker · pin flag · expiry | S21 (Preview) | Save for /build | 3 | 2 | requirement | — | |
| S24 | Saved-view editor | Member, admin | Tabbed side sheet: Filters (row-based builder) / Fields (shuttle) / Sort (reorderable rows) · scope + default toggles | S2 (Apply view) | Save for /build | 4 | 3 | requirement | — | |
| S25 | Task detail | Member, admin | Fields, thread, metadata for a child Task; precondition display if locked | S4 (Open parent) | Save for /build | 3 | 2 | requirement | — | |
| S26 | Drafts | All roles | Personal drafts — pre-record, discardable, resume to Intake | S3 (Resume draft) | Save for /build | 2 | 1 | requirement | — | |
| S27 | Search results | All roles | Access-respecting full-text results across fields, comments, and attachment filenames | S4 (Open record) | Save for /build | 3 | 2 | inferred-feature | — | |
| S28 | Import & export | Admin | CSV import (create-only) with per-row validation report · export current view | S2 (View records) | Save for /build | 3 | 2 | requirement | — | |
| S29 | Users & access | Admin | Workspace membership · level assignment · deactivation | (admin-local) | Save for /build | 3 | 2 | inferred-infrastructure | — | |
| S30 | Fields & objects | Admin | Field schema page (per workspace) · per-field configuration · per-stage visibility · Field library / catalog for task-level typed fields (URL/Text/Number/Date/Select/Checkbox) that Tasks & gates picks from | (admin-local) | Save for /build | 4 | 3 | requirement | — | |
| S32 | Views & dashboards | Admin | Shared views and dashboards management (fixed-layout dashboards in R1; no-code builder R2) | S17 (Manage dashboards) | Save for /build | 3 | 2 | requirement | — | |
| S33 | Workspace audit | Admin | Own-workspace audit log — field changes, transitions, gate decisions, config changes | S4 (Open record) | Save for /build | 3 | 2 | requirement | — | |
| S34 | Field schema | Platform admin | Platform-defined field schema surface — governs `AI Solutions Status`, system fields, `Legacy ID` | (platform) | Save for /build | 4 | 3 | requirement | — | |
| S35 | Crossing map | Platform admin | Cross-workspace field mappings — propose / confirm workflow (R1 Phase 2) | (platform) | Save for /build | 4 | 4 | requirement | — | |
| S36 | Access provisioning | Platform admin | Firm-wide access grants; Platform admin holders | (platform) | Save for /build | 3 | 2 | requirement | — | |
| S37 | Role-label catalog | Platform admin | Managed catalog of gate role labels (Manager, PG Lead, GCO, InfoSec, Data Privacy, extensible) — the same catalog S31's approver-slot role-label selectors draw from | (platform) | Save for /build | 3 | 2 | requirement | — | |
| S38 | Workspace provisioning | Platform admin | Clone the PG/Dept template — R1 Phase 2 self-serve wizard | (platform) | Save for /build | 4 | 3 | requirement | — | |
| S39 | Firm-wide audit | Platform admin | Cross-workspace audit log · search · export | S4 (Open record) | Save for /build | 3 | 2 | requirement | — | |
| S40 | No-access page | All roles | Read-blocked response — never reveals record existence | S1 (Go home) | Save for /build | 2 | 1 | inferred-infrastructure | — | |
| S41 | Empty list | All roles | Zero-data empty state: "Create your first request" | S3 (Create first) | Save for /build | 2 | 1 | inferred-infrastructure | — | |
| S42 | Filtered to zero | All roles | Records exist but none match filters — bordered card, "Clear filters" secondary CTA | S2 (Clear filters) | Save for /build | 2 | 1 | inferred-infrastructure | — | |

## Prototype navigation graph

The prototype's seven screens form a tight loop:

- **S1 Home** → S2 (Open requests) · S3 (New request, via top-bar quick-create in early iterations; final state has quick-create only on S2's view bar) · S4 (Open record from any panel) · S6 (Open dashboard) · S31 (Open admin) [from changelog: "Top bar: quick-create → workspace search"]
- **S2 Requests list** → S3 (Create request via view bar) · S4 (Row click → non-escalated record) · S5 (Row click → escalated record)
- **S3 Intake form** → S4 (Submit — new records lands on S4 detail once minted; interim iterations landed on S2 list) · S2 (Save draft)
- **S4 Record detail** → S2 (Back to list, via breadcrumb) · S4/S5 (linked-record cross-navigation via Relationships side panel)
- **S5 Escalated record** → S2 (Back to list, via breadcrumb) · S4/S5 (linked-record cross-navigation)
- **S6 AI dashboard** → S2 (Drill to filtered list, tile/segment/heatmap-cell click) · S4 (Open record from embedded grid)
- **S31 Lifecycle & gates** → (admin-local; changes here affect S4/S5's Tasks & gates tab live)

Every screen sits within one click of Home; every path returns to a known surface. The sidebar carries every prototyped screen's entry point.

---

## Cross-cutting notes

*Behaviors and patterns that surfaced during prototype iteration and apply across multiple screens.*

### Sidebar shell (all prototyped screens except when explicitly no-rail — none in prototype)
- **McDermott lockup** at top (symbol + divider + name); collapses to symbol-only on 72px rail. [from changelog: "Collapsible, grouped navigation"]
- **Workspace switcher** directly under the lockup — bordered control showing "AI Solutions · hub" with caret; opens "Your workspaces" popover. Switching stubbed (PG workspaces aren't in this prototype).
- **Grouped nav sections:** Workspace (Home · Requests · Dashboards) · Reference (Feature Catalog · Toolkit) · Admin (Users & access · Fields & objects · Views & dashboards · Lifecycle & gates · Import & export · Audit log). Admin items all stub navigation except **Lifecycle & gates** which opens S31 for real.
- **Collapse chevron** at sidebar foot (user identity moved to top-bar avatar). Desktop-only collapse to 72px rail; below 1024px it stays the slide-in drawer. No width animation on collapse (system rule — transform/opacity only). [from changelog: "User identity → top bar"]

### Top bar (all prototyped screens)
- **Workspace search** (magnifying glass, "Search this workspace") — records only (name + ID), max 6 results, closes on outside click. Full global search (S27) remains save-for-/build. [from changelog: "Top bar: quick-create → workspace search"]
- **Notification bell** — opens a small menu with two stubs: Notifications and Announcement history (both correspond to S20 Bell centre / S22 Announcements list, save-for-/build).
- **Theme toggle** — real product control, persisted (light/dark).
- **Account avatar** — opens an account menu with name + role (e.g., "Priya Raman, AI Solutions Analyst") + Profile / Sign out stubs.

### Items-grid pattern (canonical, applies to every list surface — S2, S6's embedded grid, and every future list including S9/S17/S22/S24/S25/S26/S27/S28/S30/S33/S39)
Established during iteration [from changelog: "Column breaks removed; grid features unified across all items lists"]:

- Saved-view picker + **Export view** in the view bar
- **Header fill:** navy-tinted gray (8% navy over surface); theme-aware in dark mode
- Sortable headers (asc → desc → cleared cycle) with type-aware filter funnels
- **Drag-resizable columns**, last column flexible; column breaks are 1px `--border-light` (both horizontal and vertical dividers)
- **Long-text fields wrap to 3 lines** then ellipsis (line-clamp)
- **Multi-select fields** show first 2 pills + monospace "+N"
- Aging tints where SLA applies (pale-gold due-soon, pale-orange overdue; text suffix so color is not the sole indicator)
- **List owns its scrollbar** (page stays put; header, view bar, pagination footer fixed)
- Pagination footer with **monospace record count** (25 per page default)
- Em-dash for empty cells

### Record detail behaviors (S4 and S5 share code)
- **Compact lifecycle stepper**: 24px circles on continuous track, 12px labels; still per system rule (circles on a track, never bordered rectangles). [from changelog: "Compact lifecycle stepper"]
- **Meta strip:** Display Status · Assigned Analyst · Priority Score · Due Date · **Submitted** (Origin lives in the "Escalated · [origin]" status pill in the header for escalated records only). [from changelog: "Meta strip: Submitted date replaces Origin"]
- **Tabs:** Intake / Tasks & gates / Activity (Activity content is out of scope in prototype but the tab exists). Save indicator lives on the tab row (right side) and appears only after an edit — "All changes saved" with a green cloud-check. [from changelog: "Save indicator moved to tab row"]
- **Intake tab is editable** — Description (textarea), Dept/PG/Client, Requestor, Value category, Solution type, Data sources, Who benefits, Assigned analyst, Due date all render as live form controls seeded from the record. Priority at escalation, SLA status, and Submitted remain read-only display rows. [from changelog: "Fields + Intake merged into an editable Details tab (Stephanie)"; "'Details' → 'Intake'; per-task notes"]
- **Crossed-field marker (escalated records only):** an orange ⇄ arrow icon with "Crossed field · locked on PG side" tooltip on each crossing field; the field stays editable AI-side. [from changelog: "Tasks grouped by phase + add-task; crossed marker simplified"]
- **Tasks & gates tab:**
  - Tasks grouped by build phase (**Intake · Discovery · Build · QA · Deploy · Post-launch**); each group under a phase subheading on **navy background bar with white text**; collapsible with caret. Only phases that have tasks show; anything unphased falls to "Unphased" at the end. [from changelog: "Phase headers on navy"; "Tasks grouped by phase + add-task"]
  - **Task composer** at the bottom in a **gray-boxed (bg-page) panel**, tabbed with an "Add task" and "Add bundle" segmented control on a white surface inside it. An "+ Add task" link at the top of the task list switches to the Add-task tab and focuses the title input. [from changelog: "Composer in a gray box"; "Task composer: field picker (not builder), tabbed, top link"]
  - **Task bundle templates** — Extraction / review build, Drafting assistant, Meeting-driven engagement. Applying a template appends its full task set with the right phase, sign-off steps preserved. [from changelog: "Task bundles, gates in-list, completed dates"]
  - **Per-task structured typed fields** (URL / Text / Number / Date / Select / Checkbox) — captured via a "Capture a field" picker on the composer that draws from the workspace's field library (managed by admins in S30 Fields & objects). Rendered inline under the task as a labeled capture with a type-appropriate icon. **Field-as-column rollup:** a task-level URL field can surface as a column on the Requests list (e.g., Repo URL column). [from changelog: "Structured per-task fields (typed deliverables)"; "Field types, composer field-builder, field-as-column"]
  - **Per-task Notes & decisions** expandable field — a note button on each task row toggles a textarea; the button gains a filled note-pencil icon once a task has content. [from changelog: "'Details' → 'Intake'; per-task notes"]
  - **Task ordering:** created order first, completed tasks sink to the bottom, then status as a tiebreak. Completed tasks show a date next to their status (e.g., "Done · 24 Jun"); checking a task off stamps today. [from changelog: "Task bundles, gates in-list, completed dates"]
  - **Gates rendered inline within their target phase group** (e.g., QA-readiness under QA); when resolved, collapse to a "Resolved" chip on the gate header. AND-join note visible. [from changelog: "Task bundles, gates in-list, completed dates"]
  - **Pending gate slot:** shows the role/team + an **"N eligible" count** + a **"Select your name…" dropdown** populated from that team's membership; the acting member picks themselves, then **Approve** / **Reject** appear (buttons appear only once a name is chosen; the recorded signer is the selected person). [from changelog: "Gates identify teams, not individuals"]
  - **Rejection:** requires a comment; the comment placeholder reads "required to reject". A rejected slot keeps a **rejection record** ("Rejected · person · time · comment") and surfaces a **fresh re-review row** below — a different team member can select their name, add comment, and approve or reject again. The gate stays "Changes requested" (pale-orange chip on the gate header) until someone approves; the gate stays in the analyst's Home "Needs your decision" queue. A **Re-request approval** button on the rejected slot returns it to pending. [from changelog: "Gate rejection requires comment + re-review row"; "Lifecycle & gates admin screen (S32) + rejected-gate follow-up"]
- **Side panel** (right rail, always visible beside the tabs):
  - **Relationships** — the record's `related`, `duplicate-of`, `re-pursuit-of` links with a "Link a record" action. [from changelog: "Renamed 'Typed links' → 'Relationships'"]
  - **Attachments** — files (follow the record) and external links, labeled by type.
  - **Watchers** — current watcher list with a "Watch this record" self-subscribe toggle.

### Bridge provenance on escalated records (S5)
The three-part bridge visualization from the original blueprint **is not built in the prototype**. Its provenance meaning is preserved through:

- The **"Escalated · [origin]" status pill** in the record header (Origin lives there, not in the meta strip).
- A **slim mirror note** at the top of the Intake tab for escalated records: "Shared ID · crossed fields locked on PG · PG follows delivery via mirror · Deploy/Post-launch → 'Deployed' on PG until closure."
- The **pale-gold "⇄ Crossed · locked on PG" marker** on each crossing field in the Intake tab. Fields are fully editable AI-side; the lock is conceptual and applies on the PG side only.

[from changelog: "Escalation bridge collapsed by default (Stephanie)"; "Replaced the collapsible escalation-bridge panel with an Intake tab on Request detail"]

### Aging tint semantics
Rows in list surfaces are tinted by SLA state:
- **Pale-gold** — due soon
- **Pale-orange** — overdue
- Plain (no tint) — on track or no due date
- Text suffix on the due cell repeats the state, so color is not the sole indicator (WCAG 2.2 AA § 1.4.1).

### Theme
Light + dark on every screen; theme toggle is a real product control in the top bar, not preview chrome. Persisted per user.

### Responsive
Every screen works from 320px to 1920px+; sidebar collapses to drawer below 1024px (see Sidebar shell notes above). Card content wraps or scrolls horizontally as needed (never overflows).

### Motion
Purposeful, calm — no bounce, spring, or overshoot. Functional motion uses the motion tokens; decorative motion is gated on `prefers-reduced-motion: no-preference`.

### Copy
Verb + noun buttons. Sentence-case headlines. No exclamation marks in errors. What-happened + why + how-to-fix formula on validation and error messages (`ux-copy-and-microcopy.md`). Optional-marker convention (mark optional fields, not required — no `*`).

### Icons
Phosphor regular only; sizes 16 / 20 / 24 / 32 / 48. No filled variants.

---

## Save for /build screen details

*Role/access matrix followed by per-screen blocks. Every screen the prototype defers is fully specified here so the build has a canonical spec. S8 Workspace switcher and S31 Lifecycle & gates were promoted to Prototype during reconciliation and are no longer in this section — see their master-table rows and the Cross-cutting notes above.*

### Role/access matrix

| Screen | Viewer | Member | Workspace admin | Platform admin | Dashboard-viewer |
|---|---|---|---|---|---|
| S7 Sign in | ✓ | ✓ | ✓ | ✓ | ✓ |
| S8 Workspace switcher | ✓ | ✓ | ✓ | ✓ | — |
| S9 Feature catalog | R | R | R | R | — |
| S10 Feature detail | R | R | R | R | — |
| S11 Feature gallery | R | R | R | R | — |
| S12 Feature dashboard | R | R | R | R | R (if bound) |
| S13 Add to catalog | — | ✓ | ✓ | ✓ | — |
| S14 Workload dashboard | R | R | R | R | R (if bound) |
| S15 PG starter dash | R | R | R | R | R (if bound) |
| S16 Dashboard viewer | ✓ (sole surface) | — | — | — | ✓ (sole surface) |
| S17 Dashboards list | R | R | R | R | — |
| S18 Escalate modal | — | ✓ | ✓ | ✓ | — |
| S19 Copy modal | — | ✓ | ✓ | ✓ | — |
| S20 Bell centre | ✓ | ✓ | ✓ | ✓ | — |
| S21 Announcement detail | R | R | R | R | — |
| S22 Announcements list | R | R | R | R | — |
| S23 Manage announcements | — | — | ✓ | ✓ | — |
| S24 Saved-view editor | — | ✓ (personal only) | ✓ | ✓ | — |
| S25 Task detail | R | ✓ | ✓ | ✓ | — |
| S26 Drafts | — | ✓ (own only) | ✓ (own only) | ✓ (own only) | — |
| S27 Search results | R | R | R | R | — |
| S28 Import & export | — | — | ✓ | ✓ | — |
| S29 Users & access | — | — | ✓ | ✓ | — |
| S30 Fields & objects | — | — | ✓ | ✓ | — |
| S31 Lifecycle & gates | — | — | ✓ | ✓ | — |
| S32 Views & dashboards | — | — | ✓ | ✓ | — |
| S33 Workspace audit | — | — | ✓ | ✓ | — |
| S34 Field schema | — | — | — | ✓ | — |
| S35 Crossing map | — | — | — | ✓ | — |
| S36 Access provisioning | — | — | — | ✓ | — |
| S37 Role-label catalog | — | — | — | ✓ | — |
| S38 Workspace provisioning | — | — | — | ✓ | — |
| S39 Firm-wide audit | — | — | — | ✓ | — |
| S40 No-access page | ✓ | ✓ | ✓ | ✓ | ✓ |
| S41 Empty list | ✓ | ✓ | ✓ | ✓ | — |
| S42 Filtered to zero | ✓ | ✓ | ✓ | ✓ | — |

Legend: **✓** = full access · **R** = read-only per the entitlement · **—** = not accessible. (S31 kept in the matrix for completeness — its access rules apply to the prototype-rendered surface.)

---

### S7 Sign in
- **Purpose.** SSO handshake with Entra ID.
- **Who uses it.** Everyone, once per session.
- **Content.** McDermott lockup centered; "Sign in with SSO" primary button; policy footer.
- **Business rules.** No local auth path. Sign-out returns to this screen. On success, land on the user's last-used workspace's Home (or default workspace if none).
- **Connects to.** S1 (SSO success).

### S8 Workspace switcher (deferred beyond the prototype stub)
- **Purpose.** Full workspace-picker surface with recent workspaces, favorites, and a search across the user's memberships.
- **Who uses it.** Anyone in >1 workspace.
- **Content in the prototype.** A stub bordered control in the sidebar under the lockup, opening a "Your workspaces" popover with the hub + example PG workspaces (Litigation, M&A). Switching itself is stubbed since PG workspaces aren't in this prototype.
- **Content to build.** The above, plus: real switching (redraws the rail per §21.4 of the build spec), search across memberships, favorites/pin, recent workspaces, role badge per entry.
- **Business rules.** Access resolves to the user's entitlements — a workspace they're not in never appears. Switching redraws the rail.
- **Connects to.** S1 (Switch).

### S9 Feature catalog
- **Purpose.** Browse the AI Solutions team's reusable feature inventory.
- **Who uses it.** Firm-wide read-only (via S12 dashboard) plus AI Analysts who can also add / edit.
- **Content.** Same items-grid pattern as S2 — column set + filters + saved views + Export view — but bound to the Feature object. Default view is "Published catalog" (Maturity = Published, sort Updated-at descending). "Gallery view" toggle switches to S11.
- **Business rules.** Publishing is an ordinary member edit — no approval gate. Deprecated features filtered out of default view.
- **Connects to.** S10 (Open feature) · S11 (Gallery view).

### S10 Feature detail
- **Purpose.** See a Feature's full spec.
- **Who uses it.** Anyone who can see the record.
- **Content.** Header + fields grouped (Identity / Classification / Reuse & provenance / Governance) + Attachments (visuals) + `sourced-from` typed links on side panel + Activity.
- **Business rules.** Standard record detail. Maturity change is a normal edit; captured in audit. Attachments follow the record.
- **Connects to.** S9 (Back to catalog).

### S11 Feature gallery
- **Purpose.** Visually browse features when the visual *is* the point.
- **Who uses it.** Anyone who can see the catalog.
- **Content.** Card view — first image attachment as thumbnail + name + one-liner + a few tag fields per card. Filters + saved views ride along.
- **Business rules.** Presentation-only — resolves to viewer entitlements. Cards for features with no attachments render a placeholder.
- **Connects to.** S10 (Open feature).

### S12 Feature dashboard
- **Purpose.** The firm-wide read-only browse-and-find surface for reuse.
- **Who uses it.** Firm-wide, via Dashboard-viewer binding.
- **Content.** KPI tile (Published features) · bar breakdown by Feature type · bar breakdown by Tech/stack · records grid (Published-only default). Follows the items-grid pattern.
- **Business rules.** Draft and Deprecated filtered out. Access-respecting.
- **Connects to.** S9 (Browse catalog).

### S13 Add to catalog
- **Purpose.** Harvest a reusable feature from a shipped Request.
- **Who uses it.** AI Analysts, from a shipped Request's detail or Build surface.
- **Content.** Draft form prefilled from the source Request (Name, Tech/Stack, Solution Pattern, repo URL); user fills one-liner and how-to-reuse notes; attach screenshots.
- **Business rules.** On submit, mints a Feature record in the AI Solutions workspace and stamps a `sourced-from` typed link back to the source Request. Uses the Draft mechanism (§9.7).
- **Connects to.** S9 (Save feature).

### S14 Workload dashboard
- **Purpose.** Manager and analyst view of who's loaded with what.
- **Who uses it.** AI Solutions Manager + Analysts.
- **Content.** Open records per analyst (bar) · Unassigned KPI · Pending sign-off KPI · Median time-to-first-triage (KPI-with-trend, rolling 30/90-day) · Aging in stage (histogram) · records grid with Export view. Same items-grid pattern as S2/S6. **Match S6's dashboard chrome** — 4-uniform-tiles-in-row-1 pattern where applicable.
- **Business rules.** Hub-scoped (escalated + AI-direct only). Uses date-difference primitive for the histogram (R1 Phase 2 dependency).
- **Connects to.** S2 (Drill to list).

### S15 PG starter dash
- **Purpose.** Default dashboard cloned into every PG/Dept workspace.
- **Who uses it.** PG admin and members.
- **Content.** Requests by Dept/PG/Client (bar breakdown) · Escalation status KPI (count of records where AI Solutions Status is set vs blank) · records grid.
- **Business rules.** Stage-agnostic by design — the PG template seeds no stages, so no "pipeline by stage" widget. Workspace-local; admin extends after defining lifecycle.
- **Connects to.** S2 (Drill to list).

### S16 Dashboard viewer
- **Purpose.** A Viewer whose whole surface is one bound dashboard.
- **Who uses it.** Users granted only Dashboard-viewer access.
- **Content.** No rail, no records-list navigation, no record detail, no drill-through — just the bound dashboard.
- **Business rules.** Every widget resolves to what the viewer is entitled to see. Bound to exactly one dashboard.
- **Connects to.** (none — sole surface).

### S17 Dashboards list
- **Purpose.** Directory of dashboards visible in the current workspace.
- **Who uses it.** Members and admins.
- **Content.** List with name, audience badge, last-updated. Popover-style like the Saved-view picker.
- **Business rules.** A dashboard appears only if the viewer is in its audience (§10.2 two-layer model).
- **Connects to.** S6 (Open default) · S14 (Open workload) · S12 (Open catalog).

### S18 Escalate modal
- **Purpose.** Confirm-and-lock at the moment of escalation.
- **Who uses it.** PG member/admin escalating a Request to the AI Solutions workspace.
- **Content.** Summary of what will lock (crossing fields), prompt to commit any pending edits, primary "Escalate" and secondary "Cancel".
- **Business rules.** Missing required crossing field blocks escalation. On confirm: snapshot fields, adopt ID on the AI-side record at stage Intake, lock PG-side crossing fields, open the status mirror, notify AI Intake group. **One-time, one-way** — the escalate action is disabled if already escalated (§6.6). Uses the modal pattern from `disclosure-surfaces.md`.
- **Connects to.** S5 (Confirm escalation).

### S19 Copy modal
- **Purpose.** Copy a record into a fresh draft.
- **Who uses it.** Any member/admin.
- **Content.** "Include attachments" toggle (default off), "Link back to source" radio (`related` / `re-pursuit-of` / none), Cancel/Continue.
- **Business rules.** New draft has fresh ID, no outcome, no history. Cross-workspace copy respects the crossing map for PG↔AI, else same-field-identity (§5).
- **Connects to.** S3 (Prefilled draft).

### S20 Bell centre
- **Purpose.** In-app notification centre — the day-one channel.
- **Who uses it.** Everyone.
- **Content.** Popover from the top-bar bell — mixed list of per-record notifications and Announcements, most recent first, mark-all-read. **The prototype's bell menu ships stubs for Notifications and Announcement history**; the full centre is deferred here.
- **Business rules.** Notifications for events the viewer would receive per §11.2. Announcements appear per their audience.
- **Connects to.** S4 (Open record) · S21 (Open announcement).

### S21 Announcement detail
- **Purpose.** Read a specific announcement.
- **Who uses it.** Anyone in the announcement's audience.
- **Content.** Title, body (rich text), author, published date, expiry.
- **Business rules.** Read-only for consumers; author + admins can edit until Retired. Auto-retires on Expires-on date.
- **Connects to.** S22 (Back to list).

### S22 Announcements list
- **Purpose.** Browsable history of announcements.
- **Who uses it.** Everyone.
- **Content.** List with title, snippet, published date; pinned first, then most-recent.
- **Business rules.** Audience-scoped.
- **Connects to.** S21 (Open announcement).

### S23 Manage announcements
- **Purpose.** Admin authoring surface.
- **Who uses it.** Workspace admin.
- **Content.** List of workspace announcements with status pills; "New announcement" primary; each row edits title / body / audience / pin flag / expiry.
- **Business rules.** Draft → Published → Retired. Publishing fans the "Announcement posted" event to bells in the audience. Expiry auto-retires. Never hard-deleted.
- **Connects to.** S21 (Preview).

### S24 Saved-view editor
- **Purpose.** Author or edit a saved view.
- **Who uses it.** Any member (personal views) or admin (shared views).
- **Content.** Side sheet, tabbed: **Filters** (row-based *field + comparator + value* builder — the condition engine surfaced as UI; ANDs together) · **Fields** (two-pane shuttle for column set + order) · **Sort** (reorderable rows for multi-column sort). Footer: scope toggle (personal / shared), default toggle, Cancel/Save. **The prototype's saved-view picker already surfaces Modify columns / Edit this view / Save as new view stubs — those actions open S24.**
- **Business rules.** Presentation-only — never widens access. Deleting a view never touches records. A shared view assigned to a Dashboard-viewer is that viewer's field-level boundary — same rule applies to list, filter, search, and export (§22.4).
- **Connects to.** S2 (Apply view).

### S25 Task detail
- **Purpose.** Detail surface for a child Task where there's real work.
- **Who uses it.** Member/admin working on a Task.
- **Content.** Task fields (title, assignee, status, optional precondition, structured typed field per S30's field library, Notes & decisions), thread, metadata. Precondition shown if locked. No stage stepper (Tasks have no lifecycle machinery).
- **Business rules.** Task status: Locked → Open → Done (or Cancelled). Precondition is a condition-engine rule over the Task's fields and/or its parent Request's fields — not an inter-task dependency. Closes by completion; never hard-deleted (§2.4).
- **Connects to.** S4 (Open parent).

### S26 Drafts
- **Purpose.** Personal management surface for pre-record drafts.
- **Who uses it.** Every user, for their own drafts.
- **Content.** List of the user's saved drafts with name, last-edited timestamp, resume, discard.
- **Business rules.** Drafts are pre-record — no canonical ID, no audit until submitted. Owner may discard freely (the sole exception to the no-hard-delete floor). Persist indefinitely; users clean their own.
- **Connects to.** S3 (Resume draft).

### S27 Search results
- **Purpose.** Global search results across the current workspace — across fields, comments, and attachment filenames.
- **Who uses it.** Everyone, from an entry-point beyond the top-bar workspace search.
- **Content.** Results list — record hits, comment hits, attachment-filename hits. Groups by record; shows snippet. **Distinct from the top-bar workspace search** (records-only, max 6 results) that the prototype ships.
- **Business rules.** Access-respecting — surfaces only what the viewer can see (§9.5). No OCR. Legacy ID searchable.
- **Connects to.** S4 (Open record).

### S28 Import & export
- **Purpose.** CSV import (create-only) and export current view.
- **Who uses it.** Workspace admin.
- **Content.** Upload area, mapping preview, per-row validation report table (valid rows / flagged rows with reason). Export: choose active saved view, download.
- **Business rules.** Import mints IDs from the importing workspace's prefix and sequence. Never updates live records. Requestor per-row: mapped column resolved via SSO or falls back to importing admin with a validation-report flag (never silent). No per-record notifications fire during import. Export follows viewer entitlements — export only what you can see (§13). **Every items-list Export view button** (present in the prototype's Requests list and dashboard grid) opens this surface's export path.
- **Connects to.** S2 (View records).

### S29 Users & access
- **Purpose.** Workspace membership and level management.
- **Who uses it.** Workspace admin.
- **Content.** List of members with SSO identity, level (Viewer/Member/Workspace admin), last-active, add/remove.
- **Business rules.** Deactivation with a pending individual sign-off is blocked. Orphaned references on live records don't block deactivation but notifications are suppressed (§6.8).
- **Connects to.** (admin-local).

### S30 Fields & objects
- **Purpose.** Per-workspace field schema, including the **field library** for task-level typed fields.
- **Who uses it.** Workspace admin.
- **Content.** Field list per object type · per-field configuration (name, type, validation, per-stage visibility, crossing-to for PG-side fields) · retire action · read-only band for platform-defined fields · **field library management** — the catalog of typed structured fields (URL / Text / Number / Date / Select / Checkbox) that Tasks & gates picks from when adding a task field. Seed examples: Repo URL, Design doc URL, Accuracy %, Go-live date, Environment, Privacy signed off.
- **Business rules.** Rule dependency graph is validated at save (acyclic, ≤3 levels deep). Retirement of a field that a live crossing map source/target references is guarded. Only Platform admin can edit platform-defined fields (§4.3). **Task-field type additions require workspace admin — analysts pick from the library rather than defining new types themselves** [from changelog: "Task composer: field picker (not builder), tabbed, top link"].
- **Connects to.** (admin-local).

### S32 Views & dashboards
- **Purpose.** Manage shared saved views and dashboards.
- **Who uses it.** Workspace admin.
- **Content.** Shared saved views list · shared dashboards list · audience-picker per item · promote from personal · retire.
- **Business rules.** In R1, dashboards are fixed layouts; the no-code builder lands in R2. Every dashboard's audience is two-layer.
- **Connects to.** S17 (Manage dashboards).

### S33 Workspace audit
- **Purpose.** Own-workspace audit log.
- **Who uses it.** Workspace admin.
- **Content.** Chronological event list — field changes (old → new), lifecycle transitions, gate decisions (with signer + slot context, including the selected-name from the team-only slot model), config changes (including S31 gate/team edits), escalation events. Filters by date, actor, record, event type.
- **Business rules.** Append-only, immutable. Never hard-deleted. Scoped to this workspace.
- **Connects to.** S4 (Open record).

### S34 Field schema
- **Purpose.** Platform-defined field schema — the read-only band that renders in every workspace's Fields & objects.
- **Who uses it.** Platform admin.
- **Content.** System fields · AI Solutions Status · Legacy ID. Edit definitions (name, type, binding, derivation rules). Cannot retire while any workspace's mirror / dashboard / view / crossing map depends on it.
- **Business rules.** Central definition; local presentation per workspace. AI Solutions Status has no manual write path anywhere (§4.3, §6.4).
- **Connects to.** (platform).

### S35 Crossing map
- **Purpose.** Cross-workspace field mapping between PG/Dept and AI Solutions.
- **Who uses it.** Platform admin + AI Solutions workspace admin (confirmation authority).
- **Content.** Propose / confirm workflow. Type-compatibility check on save. Retirement guarded on both sides while any mapping is live.
- **Business rules.** One-to-one only. Forward-only — new/changed mappings affect future escalations only. Derived and system fields cannot be mapped. Ships in R1 Phase 2 (read-only seed in Phase 1).
- **Connects to.** (platform).

### S36 Access provisioning
- **Purpose.** Firm-wide access grants — Platform admin holders, workspace admin holders.
- **Who uses it.** Platform admin.
- **Content.** Directory of privileged grants; audit-friendly change log.
- **Business rules.** Every grant change captured in the firm-wide audit.
- **Connects to.** (platform).

### S37 Role-label catalog
- **Purpose.** Managed catalog of gate role labels (AI Solutions Manager · GCO · InfoSec · PG/Dept Lead · Data Privacy · extensible).
- **Who uses it.** Platform admin.
- **Content.** Label list, add / rename / retire. Rename and retire are forward-only — past sign-offs keep the label they were captured under (§7.2). **This is the catalog S31's approver-slot role-label selectors draw from** — a workspace admin picks a role label from this catalog when configuring a gate slot, and manages the local team membership under that label in S31's Approver teams section.
- **Business rules.** Renames don't rewrite history.
- **Connects to.** (platform).

### S38 Workspace provisioning
- **Purpose.** Stand up a new PG/Dept workspace (R1 Phase 2 self-serve; Phase 1 is out-of-band clone).
- **Who uses it.** Platform admin.
- **Content.** Wizard: name, prefix (globally unique, validated against registry), initial admin. Kicks off the clone from the PG/Dept template.
- **Business rules.** Prefix uniqueness enforced. Sequence starts at zero; first minted record is `PREFIX-00000001`. Retired workspaces keep their registry entry so Origin resolves for historical records.
- **Connects to.** (platform).

### S39 Firm-wide audit
- **Purpose.** Cross-workspace audit log.
- **Who uses it.** Platform admin.
- **Content.** Same shape as S33 but firm-wide; includes Platform-admin edits to platform-defined fields.
- **Business rules.** Append-only, immutable. Not visible to workspace admins.
- **Connects to.** S4 (Open record).

### S40 No-access page
- **Purpose.** Read-blocked response.
- **Who uses it.** Anyone who follows a link to a record they can't see.
- **Content.** Simple pale-background surface with "You don't have access to this record. Ask your workspace admin." + "Go to Home" CTA.
- **Business rules.** **Never** reveals existence — no "record not found" copy, no ID displayed, no title. Returned uniformly for unauthorized reads regardless of whether the record exists (§22.6).
- **Connects to.** S1 (Go home).

### S41 Empty list
- **Purpose.** Zero-data empty state (workspace has no records of this type yet).
- **Who uses it.** New workspaces on first visit to a list.
- **Content.** Pale-background surface with illustration, "No requests yet" title, one-line context, primary "Create your first request" CTA (opens S3 Intake form).
- **Business rules.** Distinct from filtered-to-zero (S42) — that state gets bordered card treatment, not the new-user ceremony.
- **Connects to.** S3 (Create first).

### S42 Filtered to zero
- **Purpose.** Records exist but current filters exclude all of them.
- **Who uses it.** Anyone who over-filters a list.
- **Content.** Inline within the list — bordered card with `--bg-surface` background, subtle "No matches for these filters" title, "Clear filters" secondary CTA.
- **Business rules.** Never uses pale fill (reserved for zero-data). Text color follows theme.
- **Connects to.** S2 (Clear filters).

---

## Handoff steps

1. **Blueprint reconciled with prototype.** This document + [`solution-requirements.md`](../product/solution-requirements.md) + [`ai_solutions_tracker_build_spec_final.md`](../dev/ai_solutions_tracker_build_spec_final.md) are the three canonical sources. The prototype at `artifacts/docs/design/project/AI Solutions Tracker.dc.html` is the visual truth for prototyped screens (**S1, S2, S3, S4, S5, S6, S31**).
2. **[`HANDOFF-design-brief.md`](HANDOFF-design-brief.md) is superseded** by the prototype. Do not build from it. It stays in the folder as an audit record of the initial design brief.
3. **Run `/dev-build-architecture` next.** That skill reads this blueprint + the build spec + the requirements doc + the prototype at `artifacts/docs/design/project/` and produces the architecture artifacts under `artifacts/docs/dev/architecture/`. The blueprint's **App route / component** column will be filled in during build.
4. **Where the build spec and the prototype disagree**, the prototype wins for prototyped screens — that is the rule in `.claude/rules/design/README.md`. The build spec still governs implementation for save-for-/build screens and for behaviors not settled by the prototype.

## Change log

| Date | Changed by | What changed |
|---|---|---|
| 2026-07-03 | `/design-foundation` | Initial blueprint. 6 prototyped screens: S1 Home, S2 Requests list, S3 Intake form, S4 Record detail, S5 Escalated record, S6 AI dashboard. 36 saved for /build. No suggested-enhancement additions. Confirmed at user checkpoint. |
| 2026-07-03 | `/design-code-handoff` | Reconciled with prototype at `artifacts/docs/design/project/AI Solutions Tracker.dc.html`. **Added:** S31 Lifecycle & gates promoted to Prototype (built during iteration). **Changed:** S4 tab structure Fields → Intake (editable form); S5 three-part bridge panel replaced by inline crossed-field markers + slim mirror note + "Escalated · [origin]" status pill; meta strip Origin → Submitted; side panel Typed links → Relationships; S6 dashboard layout to 4 uniform tiles + full-width heatmap + records grid; gate approver-slot model to team-only with "Select your name" dropdown per pending slot; rejection requires comment and creates re-review row + Re-request approval button; task list grouped by phase with collapsible headers; task composer tabbed (Add task / Add bundle) in gray-boxed panel; per-task typed structured fields (URL/Text/Number/Date/Select/Checkbox) with field-as-column rollup on S2; per-task Notes & decisions; save indicator moved to tab row; top-bar quick-create replaced by workspace search (records-only); sidebar workspace switcher stub added under lockup; user identity moved to top-bar avatar. **Prototype source** column populated for S1, S2, S3, S4, S5, S6, S31; blank for all save-for-/build screens (visual review skips those). **Kept as-is:** every save-for-/build screen (no changelog-cited deletions). |
| 2026-07-03 | `/design-code-handoff` (re-run) | Re-ran against the same archive at `artifacts/docs/design/project/AI Solutions Tracker.dc.html` — prototype bytes unchanged, changelog unchanged (246 lines). **No drift** vs the previous reconciliation; every finding is already codified. Silent no-op per the skill's non-destructive default. |

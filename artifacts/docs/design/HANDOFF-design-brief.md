# HANDOFF — Claude Design brief

*This brief was authored for Claude Design to build the prototype for the AI Solutions Tracker. **The user has produced the prototype in a separate session** ([`Design brief handoff-handoff.zip`](Design brief handoff-handoff.zip) in this folder); this file is retained as a record of what the fresh brief would have looked like, and as reference input for `/design-code-handoff` when it reconciles the blueprint against the prototype.*

---

## How to use this brief

1. **Onboard the McDermott design system first.** Add the McDermott design-system reference to the session; it is the source of truth for components, tokens, typography, and spacing. Design decisions are guided by it.
2. **Paste the Anchor + scope guardrails once.** Then move to the ordered screen list.
3. **Build one screen per turn.** Start with screen 1; wait for a response before requesting screen 2. Each subsequent screen should reuse the patterns established by the previous ones (list chrome, header block, side panel, meta strip, tabs, etc.) — don't reinvent shared parts.
4. **Steer, don't specify components.** Each screen block says *what the screen is for*, *the primary action*, and *where it links onward*. It deliberately does not list components — those decisions come from the McDermott design system.

## Anchor

- **Product.** AI Solutions Tracker — a multi-workspace request-intake-and-delivery platform for the AI Solutions team at McDermott Will & Schulte. Practice Groups and Departments raise requests in their own workspaces; on escalation, work moves via a one-time, one-way bridge into a central AI Solutions workspace for delivery. A read-only status mirror keeps the originating group informed.
- **Audience.** Internal firm users only — no external clients. Primary personas: AI Solutions Analyst (daily user), PG requestor (occasional user), AI Solutions Manager (weekly reporting user), gate approvers (Manager, PG Lead, GCO, InfoSec).
- **Tone.** Firm-internal + partner-facing (McDermott Audience Level B per `standards.md`). Professional, precise, no exclamation marks, verb-plus-noun buttons, sentence-case headlines.
- **Platform.** Web, responsive, light + dark theme. Every screen works from 320px viewport up.
- **Seeded data, no auth.** Prototype uses realistic seeded content. No live SSO; the sign-in screen is out of scope.

**Adhere to the onboarded McDermott design system.** The system is the source of truth for components, tokens, typography, and spacing — design decisions are guided by it.

## Larger product (context only — do not build)

Beyond the prototyped screens the tracker is a full firm-wide platform with: an authoring surface for saved views, a bell notification centre, a browsable Announcements list, a Feature Catalog (list + detail + gallery + firm-wide read-only dashboard + "Add to catalog" flow), a Workload dashboard and a PG starter dashboard, a Dashboard-viewer surface (no rail, one bound dashboard), an Escalate confirmation modal, a Copy modal, Task detail, Drafts management, Search results, CSV Import & export, Users & access admin, Fields & objects admin, Lifecycle & gates admin, Views & dashboards admin, a workspace-scoped Audit log, and a Platform-admin section (platform field schema, crossing map, access provisioning, role-label catalog, workspace provisioning, firm-wide audit). Errors, no-access, and empty states also exist. **None of these are built here.** They exist so the prototyped screens can stub their links accurately (Settings buttons, Profile links, sidebar entries).

### Future screens — context only, do not build

These screens are part of the larger product but are NOT in this prototype's scope. Use them only as context — to label navigation, to set role-appropriate stubs, to understand the product. Do not render, design, or treat them as buildable. If I later say "now add screen X," use this list as the spec.

| ID | Screen | Role | Purpose | Connects to |
|---|---|---|---|---|
| S7 | Sign in | All roles | SSO handshake | S1 |
| S8 | Workspace switcher | All roles | Move between workspaces | S1 |
| S9 | Feature catalog | Analyst | Browse reusable-feature inventory | S10, S11 |
| S10 | Feature detail | All roles | See a feature's full spec | S9 |
| S11 | Feature gallery | All roles | Visually browse features | S10 |
| S12 | Feature dashboard | Firm-wide viewer | Read-only browse-and-find | S9 |
| S13 | Add to catalog | Analyst | Harvest a reusable feature from a shipped Request | S9 |
| S14 | Workload dashboard | Manager, Analyst | Who's loaded with what | S2 |
| S15 | PG starter dash | PG admin, member | Default dashboard cloned into every PG/Dept workspace | S2 |
| S16 | Dashboard viewer | Viewer | One bound dashboard as the entire surface | — |
| S17 | Dashboards list | Member, admin | Directory of dashboards | S6, S14, S12 |
| S18 | Escalate modal | Analyst | Confirm-and-lock at escalation | S5 |
| S19 | Copy modal | All roles | Copy a record into a fresh draft | S3 |
| S20 | Bell centre | All roles | In-app notification centre | S4, S21 |
| S21 | Announcement detail | All roles | Read a specific announcement | S22 |
| S22 | Announcements list | All roles | Browsable history | S21 |
| S23 | Manage announcements | Admin | Admin authoring surface | S21 |
| S24 | Saved-view editor | Member, admin | Author or edit a saved view | S2 |
| S25 | Task detail | Member, admin | Detail surface for a child Task | S4 |
| S26 | Drafts | All roles | Personal drafts | S3 |
| S27 | Search results | All roles | Global search | S4 |
| S28 | Import & export | Admin | CSV import (create-only), export current view | S2 |
| S29 | Users & access | Admin | Workspace membership | — |
| S30 | Fields & objects | Admin | Per-workspace field schema | — |
| S31 | Lifecycle & gates | Admin | Lifecycle and gate configuration | — |
| S32 | Views & dashboards | Admin | Manage shared views and dashboards | S17 |
| S33 | Workspace audit | Admin | Own-workspace audit log | S4 |
| S34 | Field schema | Platform admin | Platform-defined field schema | — |
| S35 | Crossing map | Platform admin | Cross-workspace field mapping | — |
| S36 | Access provisioning | Platform admin | Firm-wide access grants | — |
| S37 | Role-label catalog | Platform admin | Managed catalog of gate role labels | — |
| S38 | Workspace provisioning | Platform admin | Stand up a new PG/Dept workspace | — |
| S39 | Firm-wide audit | Platform admin | Cross-workspace audit log | S4 |
| S40 | No-access page | All roles | Read-blocked response | S1 |
| S41 | Empty list | All roles | Zero-data empty state | S3 |
| S42 | Filtered to zero | All roles | Records exist but none match filters | S2 |

## Guardrails

- **Less is more.** Prefer minimal components in service of each screen's purpose. No optional metadata or secondary controls unless they earn their place in the screen's story.
- **No auto-tweaks panel.** Don't create a "tweaks" panel or set on your own. If I want tweaks, I'll add them myself — don't pre-populate one or suggest tweaks unprompted.
- **Theme toggle is a product feature.** If the product needs dark and light mode, build the theme toggle as a real product control inside the prototype (not as your own preview switch). The user should interact with the same toggle the end user will, in the same place a real user would find it.
- **Changelog.** Can you keep a record of all the changes I make going forward in a `changelog.md` file?

## Prototype scope — six screens, in flow order

The prototype builds these six screens **only**:

1. S3 Intake form
2. S2 Requests list
3. S4 Record detail
4. S5 Escalated record ★
5. S1 Home
6. S6 AI dashboard

Build screen 1 (S3 Intake form) first and wait for a response before I ask you to build screen 2.

---

### 1. S3 Intake form — PG requestor's first touch

- **Purpose.** Capture a new request from a Practice Group or Department member. This is the first surface a PG requestor ever sees.
- **Primary action.** Submit the request (mints a canonical ID; the record appears on the Requests list) or Save draft (personal, pre-record).
- **Link onward.** On submit → S2 Requests list, with the newly minted record visible. Cancel → S2 Requests list.
- **Notes.** Two-column layout: form on the left with numbered field groups (Intake, Value mapping, Solution details, …), and an always-on **Similar requests** panel on the right that surfaces up to three keyword matches on Name + Description as the requestor types. Each match card can Dismiss, Open, Link as `related`, or Discard the draft. Conditional reveal: Client number appears when Dept/PG/Client = Client. Include a live-computed Priority score widget with sliders for Business Value / Efficiency Gain / Level of Effort.

### 2. S2 Requests list — the day-to-day working surface

- **Purpose.** Filterable, sortable, searchable grid of requests. Every analyst lives here.
- **Primary action.** Open a record (row click → S4 or S5) or Create request (→ S3).
- **Link onward.** S3 (Create request) · S4 (Open a non-escalated record) · S5 (Open an escalated record).
- **Notes.** The list scrolls inside itself — app chrome, view bar, column header row, and pagination footer stay put during vertical *and* horizontal scroll. Aging tint on rows (a subtle amber for due-soon, deeper for overdue). Per-column funnel filters (popover per header) with type-aware inputs. Saved-view picker popover above the grid. Active-filter pill with "Clear all". Show a filtered-to-zero state as well — an inline bordered card with "Clear filters" secondary CTA — separate from the zero-data empty state.

### 3. S4 Record detail — where the work happens

- **Purpose.** Detail surface for a Request. Non-escalated variant. Every field, task, gate, and event lives on this one page.
- **Primary action.** Advance the record — edit fields, complete tasks, sign off on a gate — or navigate back to the list.
- **Link onward.** S2 Requests list (Back).
- **Notes.** Header block: monospace record ID with status pills (escalation state, "On hold", "Closed · Outcome"), record name, and a meta strip of always-glanceable facts (Display Status, Assigned Analyst, Priority score, Due Date, Origin). Sticky lifecycle stepper directly below the header (Intake → Discovery → Build → QA → Deploy → Post-launch, showing done / current / upcoming states). Below that, a two-column layout: main card (left) with three tabs — **Fields** (grouped into Intake / Value mapping / Triage / Build / Deploy & outcome), **Tasks & gates** (task list plus any open gate with inline Approve / Reject controls), **Activity** (immutable-comment composer above interleaved system events and comments) — and a side panel (right) with three cards: **Typed links** (`related`, `duplicate-of`, `re-pursuit-of`), **Attachments** (files and external links), **Watchers** (with a "Watch this record" toggle).

### 4. S5 Escalated record — the bridge visualization ★

- **Purpose.** Detail surface for a Request that has escalated from a PG/Dept workspace into the AI Solutions workspace. Same content as S4 but with a bridge visualization that makes the one-time, one-way link legible.
- **Primary action.** Same as S4 — advance the record, act on tasks and gates, back to list.
- **Link onward.** S2 Requests list (Back).
- **Notes.** ★ This screen is the highest-uncertainty in the product. Between the header and the two-column layout, render an **escalation-bridge panel** as a three-part visualization:
  - **Left — the PG record.** Its crossing fields shown as a locked snapshot (lock icons), its PG-local stage marked "stays live", and the AI Solutions Status as a read-only mirror pill.
  - **Middle — the spine.** The shared canonical ID, the field lock on the PG side, and the status mirror back to the PG record.
  - **Right — the AI record.** The live, AI-controlled stage, the assigned analyst, and the editable AI-side fields (every edit logged).
  Below the visualization, a mirror band states the coarse-grained truth: "The practice group follows delivery only through the mirror. Deploy and Post-launch both read as *Deployed* on the PG side until closure."

### 5. S1 Home — the per-user landing

- **Purpose.** The first thing an analyst sees on sign-in. Answers the three morning questions in one glance: what's mine, what needs me, what changed.
- **Primary action.** Act on the most-urgent thing — most often, approve a gate from Needs your decision, or open a record from Your work today.
- **Link onward.** S2 (Open requests) · S3 (New request via quick-create) · S4 (Open a record from any panel) · S6 (Open a dashboard).
- **Notes.** Composition of viewer-scoped panels — each one is a saved query against records the viewer can already see. Order and content:
  - **Needs your decision** — open Approval Requests where the viewer is a named approver or a team member. Highest priority; act-now items with inline Approve / Reject.
  - **Your work today** — records where the viewer is Assigned Analyst, sorted by urgency (overdue and due-soon first). Spans Requests and open child Tasks.
  - **Since you were last here** — activity feed filtered to events on records the viewer follows or owns since their last visit.
  - **New to triage** — for the intake-facing audience, new escalations and unassigned records.
  - **Pinned announcements** — a slim strip at the top for pinned, in-audience Announcements.
  - **Your toolkit** — quick access to the Feature Catalog (and, in later releases, the Toolkit).
  A quick-create control (new Request, Task, or Announcement from anywhere) and a pin-as-home affordance round it out.

### 6. S6 AI dashboard — Manager's decision surface

- **Purpose.** Delivery-overview dashboard for the AI Solutions Manager and the team.
- **Primary action.** Drill through — click a tile or chart segment to filter the embedded records grid.
- **Link onward.** S2 (Drill to filtered list) · S4 (Open record from the grid).
- **Notes.** Fixed layout with one KPI tile and five larger widgets:
  - **Escalations per quarter by Origin** — segmented bar, one bar per quarter, segments by originating workspace.
  - **Unassigned** — KPI tile; count of past-Intake records with no Assigned Analyst.
  - **Pipeline by stage** — segmented bar; counts across the six AI-side stages.
  - **Closures this quarter** — bar breakdown by Outcome (Live / Declined / Withdrawn / Duplicate).
  - **Requests by Dept/PG/Client × stage** — heatmap matrix; a "— (unset)" row for records with no Dept/PG/Client value.
  - **Records grid** — saved-view-driven list with export at the bottom of the dashboard.
  Widget counts are independent filters and may overlap (a single record can be counted in more than one widget at once).

---

## Scope guardrail

Build these six screens only. **One direction each.** No extra screens. **Do not build any Future screen from the context table unless I explicitly ask.** If any decision needs a variant to be legible, propose the variant explicitly and ask before building it.

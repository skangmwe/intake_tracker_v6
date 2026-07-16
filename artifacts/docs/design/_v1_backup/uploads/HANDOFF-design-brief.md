# AI Solutions Tracker — Design Prototype Brief

> **For Claude Design.** This is the whole brief. Read it once at the start; you have everything you need to build the six prototype screens.

## How to work with me

Onboard the **McDermott design system** before you begin — this brief assumes it's loaded. Then build **one screen per turn** in the flow order below. After each screen renders, I'll say "next" and name the following screen; steer through the sequence rather than composing all six at once, so each screen reuses the visual patterns the previous one established (list chrome, record header, meta strip, sticky lifecycle stepper, side panel, disclosure surfaces).

**Adhere to the onboarded McDermott design system.** It is the source of truth for components, tokens, typography, spacing, and layout — every design decision is guided by the system, not by generic enterprise defaults. If you feel the pull to add a border, bump a radius, tint a background, or reach for a component the system doesn't ship, resist it. Restraint is what makes this system read as McDermott.

## Anchor — what you're building

The **AI Solutions Tracker** is a firm-wide, single-instance, multi-workspace application for a large professional-services firm. It gives every Practice Group and Department its own workspace for local intake and triage, gives the AI Solutions team a central "hub" workspace for delivery, and wires them together through a one-time, one-way "escalation bridge" so a request raised inside a Practice Group can hand off cleanly to the AI Solutions team while the PG side still sees delivery status update live.

- **Audience:** internal firm employees only. Three primary personas — AI Solutions analysts (this prototype's default persona), Practice Group / Department members raising requests, and firm employees granted read-only Dashboard-viewer access to specific dashboards. Not client-facing.
- **Tone:** precise, warm, confident, never cute. Editorial in headlines; neutral in UI. No exclamation marks in errors, no "Oops!", no emoji in the product surface.
- **Platform:** modern evergreen web browsers only, responsive layout down to 320px. No native mobile app. Both light and dark theme.
- **Seeded data / no auth:** populate the prototype with realistic seeded data so screens render meaningfully. No authentication flow in the prototype — the analyst is already signed in and lands on Home.

**All six prototype screens sit in the AI Solutions workspace.** This is the richer superset — full six-stage lifecycle, approval gates, Feature Catalog access, AI-side delivery fields. Practice Group / Department workspaces are strict subsets and will be derived in `/build` from the same design vocabulary.

## Less is more

Prefer minimal components in service of each screen's purpose. Do not add optional metadata rows, secondary controls, or "helpful" extras that aren't called out in this brief. If a field, button, or panel isn't listed for a screen, don't invent it. Every added element earns its place by serving the screen's primary purpose; anything else is noise.

## Don't create a 'tweaks' panel or set on your own. If I want tweaks, I'll add them myself — don't pre-populate one or suggest tweaks unprompted.

## If the product needs dark and light mode, build the theme toggle as a real product control inside the prototype (not as your own preview switch). The user should interact with the same toggle the end user will, in the same place a real user would find it.

## Can you keep a record of all the changes I make going forward in a `changelog.md` file?

---

## The larger product (context only — do not build)

The six screens in this prototype are one thread through a much larger multi-workspace product. The wider product also includes: workspace and firm-wide **admin surfaces** (workspace membership + access, field schema editor, lifecycle and gates configuration, saved-views + dashboards authoring, announcement management, CSV import + export, workspace audit log); firm-wide **platform admin** (platform-defined field schema, PG↔AI crossing map editor, access provisioning, role-label catalog, workspace provisioning, cross-workspace audit); a **Feature Catalog** of reusable capabilities with a gallery view and firm-wide read-only browsing; a **Toolkit** of playbooks / plugins / prompts (Release 2); an **Announcement** system delivered to a notification bell with pinned notices; **advanced views** (Kanban, timeline, agenda); **global search** across records, comments, and attachment filenames; **CSV import** with per-row validation; a full **audit trail**; and per-user **settings / profile**. The prototyped screens should reflect that this larger product exists — labels in navigation, stubbed links to future surfaces, role-appropriate menu items — without you rendering any of it.

### Future screens — context only, do not build

These screens are part of the larger product but are NOT in this prototype's scope. Use them only as context — to label navigation, to set role-appropriate stubs, to understand the product. Do not render, design, or treat them as buildable. If I later say "now add screen X," use this list as the spec.

| ID | Name | Role | One-line purpose | Key connects-to |
|---|---|---|---|---|
| S1 | Sign in (SSO) | Everyone | Entra ID SSO redirect landing | S3 Home on success |
| S2 | No workspace / access denied | Everyone | Explains authenticated-but-unprovisioned state | External support flow |
| S8 | Request detail (unescalated) | Member | Same layout as escalated Request detail minus bridge panel | S11 Escalate, S7 Tasks & gates |
| S9 | Request detail — Activity | Analyst | Immutable-comment thread + interleaved system events | Individual event source |
| S10 | Draft (personal) | Member | Pre-record placeholder for an in-progress Request | S5 Intake form (resume) |
| S11 | Escalate confirm & lock | Workspace admin | One-time confirm step opening the escalation bridge | S6 Request detail (escalated) |
| S12 | Task detail | Analyst | Full detail for a child Task with content | Parent Request |
| S14 | Workload dashboard | Manager | Second AI Solutions dashboard for capacity management | S4 Requests list (drill) |
| S15 | Feature Catalog dashboard | Everyone | Firm-wide read-only reuse discovery | S18 Feature Catalog list |
| S16 | PG/Dept starter dashboard | Member (PG) | Fixed-layout starter dashboard for a PG workspace | S4 Requests list (drill) |
| S17 | Dashboard viewer surface | Dashboard viewer | Single bound dashboard fills entire surface | (terminal) |
| S18 | Feature Catalog list | Member | Browsable list of reusable-feature entries | S19 gallery, S20 detail |
| S19 | Feature Catalog gallery | Member | Card-with-thumbnail visual browse | S20 Feature detail |
| S20 | Feature detail | Member | Full detail of a catalogued feature | Source Request via `sourced-from` |
| S21 | Add to catalog draft | Analyst | Feature Catalog draft prefilled from a shipped Request | S20 Feature detail |
| S22 | Toolkit page | Member | Filterable catalog of playbooks / plugins / prompts (Release 2) | (its own detail surfaces) |
| S23 | Kanban view | Member | Records grouped by Stage as columns | S6 Request detail |
| S24 | Timeline view | Member | Records plotted against date-bearing fields | S6 Request detail |
| S25 | Agenda view | Member | Today and the week for date-bearing records | S6 Request detail |
| S26 | Bell / notification centre | Everyone | Per-record notifications + broadcast Announcements | S6 Request detail, S7 Tasks & gates |
| S27 | Announcement compose | Workspace admin | Author a broadcast notice | S28 history |
| S28 | Announcement history | Everyone | Browsable list of past announcements | (terminal) |
| S29 | Global search results | Everyone | Field text + comment text + attachment filenames | S6, S20 |
| S30 | Users & access | Workspace admin | Workspace membership + role assignment + user groups | User profile |
| S31 | Fields & objects | Workspace admin | Workspace field schema editor | S32 |
| S32 | Lifecycle & gates config | Workspace admin | Stage definitions + gate builder | S31, audit |
| S33 | Views & dashboards admin | Workspace admin | Shared saved-view and dashboard authoring | All list + dashboard surfaces |
| S34 | Manage announcements | Workspace admin | Workspace-scoped Announcement admin | S27 compose |
| S35 | Import & export (CSV) | Workspace admin | Bulk create + view export | Records list |
| S36 | Audit log (workspace) | Workspace admin | Own-workspace append-only event log | Individual record |
| S37 | Platform field schema | Platform admin | Firm-wide platform-defined fields administration | S42 audit |
| S38 | Crossing map editor | Platform admin | PG↔AI field mapping administration | S31 Fields & objects |
| S39 | Access provisioning | Platform admin | Firm-wide user / workspace / role management | S30 per workspace |
| S40 | Role-label catalog | Platform admin | Approver role label catalog admin | S32 gates config |
| S41 | Workspace provisioning | Platform admin | Self-serve workspace creation wizard (Phase 2) | First-workspace-admin session |
| S42 | Cross-workspace audit | Platform admin | Firm-wide append-only audit search + export | Individual record activity thread |
| S43 | Empty state (zero data) | Everyone | First-run pale-fill ceremony on a fresh list | (state pattern) |
| S44 | Filtered to zero | Everyone | Subtle bordered "no matches" state on a filtered list | (state pattern) |
| S45 | No access response | Everyone | Non-disclosure response for unentitled requests | (state pattern) |
| S46 | Not found (404) | Everyone | Route matches nothing | (state pattern) |
| S47 | User profile | Everyone | Personal preferences surface | (from top-bar avatar) |

---

## Prototype screen list (build in this order)

1. **S3 Home** — the daily landing surface
2. **S4 Requests list** — day-to-day working surface
3. **S5 Intake form (AI Solutions)** ★
4. **S6 Request detail (escalated)** ★
5. **S7 Request detail — Tasks & gates tab** ★
6. **S13 AI Solutions default dashboard**

**Build S3 first and stop there.** Wait for me to say "next" before starting S4. Same pattern through all six.

---

## Screen briefs

### 1. S3 Home

**Purpose.** The AI Solutions analyst's daily landing surface — the first thing they see after signing in. It answers three questions in one glance: what's mine, what needs me, and what's changed since I was last here.

**What it shows.** Five stacked panels — Needs your decision (open Approval Requests where the analyst is a named approver or in an approver team), Your work today (records where the analyst is Assigned Analyst, urgency-ordered by due-date proximity), Since you were last here (activity feed of gate decisions, holds cleared, closures, and @mentions on records the analyst follows or owns), New to triage (new escalations and unassigned records), and a slim strip of Pinned announcements above them all. A quick-create button (new Request / Task / Announcement) sits in the top bar; a "pin as home" affordance lets the user set the Home — or any dashboard or saved view — as their default landing surface.

**Primary action.** Click into a Needs-your-decision item to open S7 Tasks & gates for that record, or click into a Your-work-today item to open S6 Request detail.

**Link onward.** From Home the analyst navigates via the sidebar to Requests (S4) or Dashboards (S13); from the bell in the top bar they enter the notification centre; from a panel item they enter the record.

### 2. S4 Requests list

**Purpose.** The day-to-day working surface where analysts triage inbound, sort by priority or due date, filter by state, and drop into any record. It is the primary surface below Home and the highest-frequency page in the product.

**What it shows.** A records grid with columns driven by the active saved view; a view bar above the grid with a **saved-view picker** (left), an **active-filter pill** with clear-all (middle), and the primary **Create request** action (right); per-column headers with sort cycle (asc → desc → cleared) and a filter funnel that opens a type-aware popover (checkbox list for selects with per-value counts, comparator picker for numerics with typed-expression shorthand like `>30`, date pickers for dates, substring input for text); a subtle **aging tint** on rows (due-soon amber, overdue deeper amber, driven by SLA Status); pagination and a monospace record count in the footer. The list scrolls **inside itself** — the app chrome, page header, view bar, column header row, and pagination footer all stay put as the analyst scrolls through records. Horizontal overflow is likewise owned by the table shell.

**Primary action.** "Create request" opens S5 Intake form.

**Link onward.** Row click opens S6 Request detail (escalated variant on the analyst's rows). Row-detail side sheet on hover-and-click for a quick peek without leaving the list. Drill-through from any tile on the dashboard (S13) also lands here filtered.

### 3. S5 Intake form (AI Solutions) ★

**Purpose.** The form the analyst fills out to file a new Request into the AI Solutions workspace directly. It is also the pattern used by every Practice Group / Department for their own intake, so the layout must be robust — but in this prototype the analyst-facing superset is what we're validating.

**What it shows.** A two-column layout: the form on the left, an **always-on Similar requests panel** on the right that surfaces up to three existing requests matching on Name + Description keyword as the analyst types (each with dismiss, open, and "link as related" actions). The form itself is organised into **numbered grouped sections** — Intake, Value mapping, Solution details, Triage — with required markers and paired two-column rows where fields belong together. **Conditional-reveal blocks** appear inline when another field's value calls for them (Client number appears as a distinct revealed block when Dept/PG/Client is set to Client). A **Priority Score widget** shows three sliders (Business Value, Efficiency Gain, Level of Effort — each 1–5) with a **live-computed Priority Score** displayed alongside its formula (`Business Value + Efficiency Gain − Level of Effort`) so the requestor watches the derived value form as they set the inputs. The Submit and Save-draft actions live in the form footer.

**Primary action.** Submit mints the record and lands the analyst on S6 Request detail. Save-draft persists a personal pre-record draft that doesn't appear on lists, notify the team, or enter the audit trail.

**Link onward.** Submit → S6 Request detail. Save draft → returns to S4 Requests list (draft is discoverable only in the analyst's own drafts view, not shown in this prototype).

### 4. S6 Request detail (escalated) ★

**Purpose.** The primary work surface for a Request that has been escalated from a Practice Group / Department workspace into the AI Solutions workspace. It shows the analyst everything they need to act on the record — its content, its provenance (where it came from and what state the PG side is in), and its position in the AI Solutions delivery lifecycle.

**What it shows.** A **header block** across the top: monospace record ID with status pills to its right ("Escalated · [origin]", plus "On hold" or "Closed · [Outcome]" when applicable), the record name below, then a **meta strip** of the always-glanceable facts (Display Status coloured, Assigned Analyst, Priority Score, Due Date, Origin), then a **sticky lifecycle stepper** rendering the six AI Solutions stages (Intake → Discovery → Build → QA → Deploy → Post-launch) with done / current / upcoming states. Immediately below the header: the **escalation-bridge panel** — a three-part spatial visualization showing the PG record (with its crossing fields as a locked snapshot, its PG-local stage marked "stays live", and the AI Solutions Status as a read-only mirror pill), the **spine** in the middle (the shared canonical ID, the field-lock indicator, and the status-mirror-back indicator), and the AI record (the live AI-controlled stage, the assigned analyst, and the editable AI-side fields). A **mirror band** across the panel states the coarse truth: the practice group follows delivery only through the mirror, and Deploy + Post-launch both read as "Deployed" on the PG side until closure. Below the bridge panel: a **two-column body** — a tabbed main card on the left (Fields shown by default, with Tasks & gates and Activity as the other two tabs), and a **side panel** on the right with three small cards (Typed links — the record's `related`, `duplicate-of`, and `re-pursuit-of` links with a "Link a record" action; Attachments — files and external links, each labeled by type; Watchers — the current watcher list with a "Watch this record" toggle for self-subscribe).

**Primary action.** No single primary — this is a working surface. The analyst switches tabs (Fields ↔ Tasks & gates ↔ Activity), edits fields, follows typed links, and adds comments in the Activity tab.

**Link onward.** Tab click into Tasks & gates → S7. Task in the side panel or Tasks tab → S12 Task detail. `related` link → connected record. "Add to catalog" button when the record is shipped → S21 Add to catalog draft.

### 5. S7 Request detail — Tasks & gates tab ★

**Purpose.** The tab where the analyst does the two things this product uniquely mediates: **approving stage advances** (gates) and **working the record's to-dos** (child Tasks). Approvals happen on-record, inline, with the frozen approver set visible; Tasks are lightweight children of the Request with their own state.

**What it shows.** The same S6 header + meta strip + sticky stepper + side panel — only the main card content differs. Inside the main card: at the top, an **open gate block** if a gate is active (the gate name, the **transition it fires on** — for example "Build → QA" — an **AND-join** note, and the **approver slots** each shown as a row with the person or team, their **role label** (AI Solutions Manager / GCO / InfoSec / PG/Dept Lead), and either a "✓ approved" state with the signer + timestamp or inline **Approve / Reject** actions with an optional comment field); below the gate block, a **task list** of the record's child Tasks — each row shows a checkbox state (**done / open / locked**), title, assignee (avatar + name), and a status pill; a **locked** task shows its **precondition** in plain language on hover-and-click. Sign-off tasks expose the same inline Approve / Reject as the gate slots — the two are visually distinct even though they share the list.

**Primary action.** Approve or Reject a gate slot inline (with optional comment); check off / open / cancel a Task; open a Task with substantive content into its own detail (S12).

**Link onward.** Task row click → S12 Task detail. Approve fires the audit + notifications and, if it's the final AND-slot, resolves the gate and advances the stage in the stepper.

### 6. S13 AI Solutions default dashboard

**Purpose.** The seeded default dashboard for the AI Solutions workspace — the reporting surface the manager and analysts use to see pipeline health at a glance and drill into what needs attention. Anchors the dashboard visual language that reappears on the Workload dashboard, Feature Catalog dashboard, PG starter dashboard, and Dashboard-viewer surface.

**What it shows.** A **fixed layout** with one KPI tile and five larger widgets. The **Unassigned** KPI tile shows the count of past-Intake records with no Assigned Analyst. The five larger widgets are: **Escalations per quarter, by Origin** (a segmented bar with one bar per quarter, segments coloured by originating workspace); **Pipeline by stage** (a segmented bar with counts across the six AI-side stages); **Closures this quarter** (a bar breakdown by Outcome — Live / Declined / Withdrawn / Duplicate); **Requests by Dept/PG/Client × stage** (a heatmap with rows for the Dept/PG/Client field's configured categories including a surfaced "— (unset)" row rather than a silent drop, and columns for the six AI-side stages); and the **records grid** (a saved-view-driven list with export). Tiles and chart segments are **clickable to filter the embedded records grid** — the primary drill-through pattern. This surface goes **full-width** with side gutters (not the 1200px reading cap) because the heatmap needs the canvas.

**Primary action.** Drill through — click any tile or chart segment to filter the embedded records grid; click any row in the grid to open S6 Request detail.

**Link onward.** Drill-through → S4 Requests list (filtered) or directly to S6 via row click on the embedded grid.

---

## Scope guardrail

- **One direction per screen.** Give me one confident answer per screen — no A/B variants, no side-by-side alternatives. If you're unsure between two approaches, pick the one that most fits the McDermott system and note the alternative in `changelog.md`.
- **No extra screens.** Six screens total. Don't render anything from the Future screens table above, and don't introduce screens I didn't ask for.
- **Variant note.** All six screens sit in the AI Solutions workspace. When links point to Practice Group / Department workspace surfaces, stub them as navigation labels only — never render a PG variant.
- **Do not build any Future screen from the context table unless I explicitly ask.** If I say "now add S18 Feature Catalog list", treat that row's entry as the spec and build it in the same session. Until I say so, they are context only.

**Build S3 Home first. Stop and wait for me to say "next" before starting S4.**

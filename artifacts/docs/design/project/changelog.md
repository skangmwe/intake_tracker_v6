# AI Solutions Tracker — changelog

## 2026-07-02 · Gate rejection requires comment + re-review row

- A gate slot can only be **rejected with a comment** — the Reject button appears only once both a name is selected and a comment is entered (comment placeholder now says "required to reject"). Approve still needs only a name.
- After a rejection, the slot keeps a **rejection record** (Rejected · person · time + the comment) and surfaces a **fresh re-review row** beneath it — a new team member can select their name, add comments, and approve (or reject again). The gate stays "Changes requested" until someone approves.

## 2026-07-02 · Phase headers on navy

- The collapsible phase category headers (Discovery, Build, QA…) in the Tasks & gates list now sit on a navy background bar with white text, visually separating each phase's task group.

## 2026-07-02 · Gate slot pending layout

- On a pending gate slot, the "Select your name" dropdown is now a fixed narrow width on its own line under the team label, and the Optional comment field flexes to fill the row width; Approve/Reject follow once a name is chosen.

## 2026-07-02 · Gates identify teams, not individuals

- **Lifecycle & gates page:** gate approver slots now identify only the **team / role label** (with an "N eligible" count) — no per-person entry. Added an **Approver teams** section below the gates that lists the members of each role label (AI Solutions Manager, GCO, InfoSec, PG/Dept Lead, Data Privacy) as editable chips with add/remove.
- **Request page (S7):** each pending gate slot shows the role/team and a **"Select your name…" dropdown** populated from that team's membership; the acting member picks themselves, then Approve/Reject (buttons appear once a name is chosen). The recorded signer is the selected person. Re-request clears the selection back to pending.
- This decouples gate config (stable: which teams must approve) from who actually signs (varies per request), matching how approvals really happen.

## 2026-07-02 · Lifecycle & gates admin screen (S32) + rejected-gate follow-up

- Built the **Lifecycle & gates** workspace-admin screen (sidebar → Admin → Lifecycle & gates). Stages section shows the six-stage lifecycle as numbered circles with a gate icon marking transitions that require approval. Gates section is a live editor: each gate has an editable name, from→to transition selects, and an approver-slot list (role-label select from the catalog + person/team + remove), with add/remove for both gates and slots, plus AND-join note. Seeded with the two existing gates (QA readiness on Build→QA, Post-launch readiness on Deploy→Post-launch). Add stage / add-approver / etc. mutate live state.
- This is the source of truth for gate config; the on-record S7 Tasks & gates tab only *acts on* the gates this defines.
- **Rejected-gate resurfacing:** a rejected slot now reads "Changes requested · signer · time" and exposes a **Re-request approval** button that returns the slot to pending so, after follow-up, the approver can approve it. The gate header shows a pale-orange "Changes requested" chip while any slot is rejected, so the blocker is visible; the gate stays in the analyst's Home "Needs your decision" queue until all slots approve and it resolves.

## 2026-07-02 · Renamed "Typed links" → "Relationships"

- Renamed the side-panel "Typed links" section to "Relationships" (drops the internal "typed" jargon). Alternatives offered: Related records, Linked records, Connections, Related items — awaiting confirmation on final wording.

## 2026-07-02 · Composer in a gray box; collapsible phases; task ordering

- The Add task / Add bundle composer now sits in a gray (bg-page) boxed panel, clearly separated from the phase groups above it; the tab control sits on a white surface inside it.
- Phase group headers are now collapsible — click a phase (Discovery, Build, QA…) to collapse/expand its tasks and gate, with a caret indicator.
- Task ordering within each phase: created order first, completed tasks sink to the bottom, then status as a tiebreak. New tasks append in creation order; checking one off moves it down.

## 2026-07-02 · Task composer: field picker (not builder), tabbed, top link

- The task composer no longer lets analysts define new field *types* — that's a platform/workspace-admin capability (Fields & objects). On the task, analysts now **pick an existing field** from the field catalog (Repo URL, Design doc URL, Accuracy %, Go-live date, Environment, Privacy signed off) via a "Capture a field" picker, with a note pointing to admins for new field types.
- The composer is now **tabbed**: "Add task" and "Add bundle" as a segmented control, so the single-task form and the bundle-template form no longer stack.
- Added an **"+ Add task" link at the top of the task list** (in the Tasks header) that switches to the Add-task tab and focuses the title input, so it's reachable without scrolling to the bottom.
- Field catalog (FIELD_LIBRARY) is the single source the picker draws from — the same list an admin's Fields & objects screen would manage.

## 2026-07-02 · Field types, composer field-builder, field-as-column

- **More field types on tasks:** the per-task field now renders by type — Text, URL (with open button), Number, Date (date picker), Select (dropdown with options), and Checkbox (Yes/No toggle). Each shows a type-appropriate icon. Seeded examples on REQ-1042: Accuracy % (number), Privacy signed off (checkbox), Environment (select), Go-live date (date), Repo URL (url).
- **Composer builds fields:** the add-task composer has a "Capture a field" row — pick a type (Text/URL/Number/Date/Checkbox) and give it a label; the new task carries that field. Templates can also declare fields (Extraction / review build includes a Repo URL on its GitHub step).
- **Field surfaced as a Requests column:** added a "Repo URL" column to the Requests list that rolls the task-level URL field up to the record (clickable link, em-dash when none) — demonstrating why the value belongs in a structured field rather than notes: it can be tracked across records at the list level. Column is resizable like the rest.
- Note: the list column reads seeded task-field values; live edits to a task field reflect on the record's own detail. A real build would persist task fields to the record for list rollup.

## 2026-07-02 · Structured per-task fields (typed deliverables)

- Tasks can now carry a typed field — a structured value the task is meant to produce, kept separate from freeform Notes & decisions so it's consistent and trackable across requests. First type: URL.
- Renders inline under the task as a labeled capture (link icon + label + monospace input); once filled, an "open" button appears to follow the link. Seeded on a "Create GitHub repo for the pipeline" task (Repo URL) and included in the Extraction / review build bundle so applying that template carries the field.
- Rationale (per request): a "create a GitHub folder → capture the URL" style deliverable lives in its own field, not buried in notes — so the same field can later be surfaced as a column / rolled up across records. This is the field pattern; more types (text, date, number) can extend it, and the add-task composer could let analysts attach one when defining a task if wanted.

## 2026-07-02 · Task bundles, gates in-list, completed dates

- **Task bundle templates:** the composer now has two rows — an "Add a task bundle" row (template picker + Add bundle) above the single-task row. Templates seeded: Extraction / review build, Drafting assistant, Meeting-driven engagement. Applying one appends its full task set (each with the right phase; sign-off steps preserved). Analysts can still add ad-hoc single tasks alongside.
- **Gates folded into the task list:** removed the separate gate box. The gate now renders inline within its target phase group (e.g. the QA readiness gate sits under QA), showing the transition pill, AND-join note, and inline approver slots. When resolved it collapses to a "Resolved" chip on the gate header. No more standalone gate/section boxes.
- **Completed dates:** finished tasks show a calendar-check date next to their status (e.g. "Done · 24 Jun"); checking a task off stamps today's date, reopening clears it, and sign-off approvals stamp the date too. Seeded historical completion dates on the done tasks.
- Options offered for surfacing completed dates: (a) inline muted date by the status pill — the default now shipped; (b) a dedicated right-aligned "Completed" column; (c) only inside the expanded notes. Say the word to switch.

## 2026-07-02 · "Details" → "Intake"; per-task notes

- Renamed the Details tab back to **Intake** (order: Intake · Tasks & gates · Activity). Still the merged, editable field set.
- Every task now has an expandable **Notes & decisions** field: a note button on each task row toggles a textarea for recording things like meeting notes or decisions made (e.g. on a "Meet with stakeholders" task). The button gains a "Notes" label and a filled note-pencil icon once a task has content, so tasks with notes are scannable. Notes persist per task for the session, and new tasks added via the composer support them too.

## 2026-07-02 · Save indicator moved to tab row, shown only after an edit

- The "saved" indicator no longer sits inside the Details tab and no longer shows at rest. It now lives on the tab row (right side) and appears only once the analyst has edited a field, reading "All changes saved" with the green cloud-check. Being on the tab row, it's not repeated per tab.

## 2026-07-02 · Tasks grouped by phase + add-task; crossed marker simplified

- Crossed-field marker on the Details tab is now just the ⇄ arrow icon (orange, with a "Crossed field · locked on PG side" tooltip) — the full pill text is gone.
- Tasks in the Tasks & gates tab are now grouped by build phase (Intake → Discovery → Build → QA → Deploy → Post-launch), each group under a phase subheading with its own count. Only phases that have tasks show; anything unphased falls to an "Unphased" group at the end.
- Added an inline add-task composer at the bottom of the task list: title field + phase select (defaults to the record's current stage) + Add task. New tasks append as open, assigned to the current analyst, into the chosen phase group. Session-persistent.

## 2026-07-02 · Fields + Intake merged into an editable Details tab (Stephanie)

- Merged the Fields and Intake tabs into a single **Details** tab (order: Details · Tasks & gates · Activity). "Fields" as a name is gone.
- Details is now genuinely editable: Description (textarea), Dept/PG/Client, Requestor, Value category, Solution type, Data sources, Who benefits, Assigned analyst, and Due date all render as live form controls the analyst edits in place, seeded from the record when opened. An autosave-style status indicator ("Up to date" → "All changes saved") sits at the top-right, per the system's save-state pattern.
- Crossed fields keep their pale-gold "Crossed · locked on PG" pill but remain fully editable here — edits don't flow back to the PG side; the lock is only on the PG/Dept side. The mirror note explains this at the top for escalated records.
- Priority at escalation, SLA status, and Submitted remain read-only display rows below the editable set (derived/system values).
- Home "Needs your decision" still deep-links to the Tasks & gates tab; old fields/intake deep-links now resolve to Details.

## 2026-07-02 · Escalation → Intake tab; crossed not locked (Stephanie)

- Replaced the collapsible escalation-bridge panel with an **Intake tab** on Request detail (order: Fields · Intake · Tasks & gates · Activity).
- Intake tab shows the intake fields (Dept/PG/Client, Requestor, Description, Value category, Solution type, Data sources, Who benefits, Priority at escalation, Submitted). For escalated records, the crossed fields carry a "Crossed · locked on PG" pill (pale-gold) rather than being rendered read-only/locked here — the AI team can still edit them; the lock is conceptual and applies on the PG/Dept side only.
- A slim mirror note sits at the top of the tab for escalated records (shared ID, crossed-fields-locked-on-PG, PG follows via status mirror, Deploy/Post-launch → "Deployed" on PG until closure) — preserving the provenance meaning the bridge panel carried, without the full-width visualization.
- Non-escalated records show the same Intake tab with no crossed markers and no mirror note.

## 2026-07-02 · Escalation bridge collapsed by default (Stephanie)

- The escalation-bridge panel no longer occupies the prime real estate below the header. It's now a collapsible disclosure: collapsed by default, showing a one-line summary ("Escalated from [origin] · crossing fields locked · PG follows delivery via mirror") with a caret. Expanding reveals the full three-part PG ↔ spine ↔ AI visualization and the mirror band.
- Rationale (Stephanie): this is provenance/intake reference, not the active work surface — so it stays one click away instead of pushing the Fields/Tasks work down the page.

## 2026-07-02 · Meta strip: Submitted date replaces Origin (Stephanie)

- Request detail meta strip now shows Submitted (date) in place of Origin/Dept/PG/Client. Origin is still visible via the "Escalated · [origin]" status pill in the header, and Dept/PG/Client remains in the Fields tab and the escalation-bridge panel, so nothing is lost. Seeded submitted dates on the detailed records; others fall back to a sensible date.

## 2026-07-02 · Compact lifecycle stepper (Stephanie)

- The sticky stepper bar on Request detail is now roughly half its former height: 24px circles, tighter circle-to-label gap, 12px labels, reduced bar padding. Still circles on a continuous track per the system rule.

## 2026-07-02 · Column breaks removed; grid features unified across all items lists

- Removed the vertical column-break lines from the Requests list (rows separate by horizontal rules only, as before).
- The dashboard's embedded grid now carries the full items-grid pattern: drag-to-resize columns, three-line text wrapping on Name, gray sticky header, internal scroll, flexible last column.
- **Items-grid pattern (canonical, for every future list surface — Fields & objects, Feature Catalog, audit log, etc.):** saved-view picker + Export view in the view bar · gray header fill (8% navy over surface) · sortable headers with type-aware filter funnels · drag-resizable columns, last column flexible · long-text fields wrap to 3 lines then ellipsis · multi-select fields show 2 pills + "+N" · aging tints where SLA applies · list owns its scrollbar (page stays put) · pagination footer with mono record count · em-dash for empty cells.

## 2026-07-02 · Name wraps too

- Name column now wraps up to three lines like Description (line-clamp with ellipsis beyond).

## 2026-07-02 · Long-text wrapping

- Description column now wraps up to three lines (line-clamp), truncating with an ellipsis beyond that; full text still available on hover. Rows grow to fit.

## 2026-07-02 · Resizable columns, visible column breaks, eye removed

- Columns on the Requests list are now user-resizable: drag the invisible handle on each header's right edge (col-resize cursor). Due date stays flexible and absorbs leftover width. Widths reset on reload.
- Faint vertical dividers (same 1px border-light as the row lines) now mark every column break, in the header and body.
- Removed the quick-peek eye column and its side sheet — row click into the full Request detail is the only drill-in, per your call.

## 2026-07-02 · Long-text + multi-select columns on the Requests list

- Added a Description column (long-text rendering: single line, ellipsis-truncated, full text on hover via tooltip, secondary tone so it doesn't compete with Name) and a Tags column (multi-select rendering: first two values as bordered pills, remainder collapsed to a mono "+N"). Seeded capability tags on all 18 records.
- Neither column sorts or filters yet — long-text and multi-select filtering (substring / any-of) can be wired to the existing funnel pattern on request.
- Grid min-width grew to 1480px; the table shell already owns horizontal scroll.

## 2026-07-02 · Export on all items lists

- Added an "Export view" button beside the saved-view picker on the Requests list. The dashboard's embedded grid already carried one; every items list now exposes export next to its view control. (Both stubs — CSV export is S35.)

## 2026-07-02 · Top bar: quick-create → workspace search (Stephanie)

- Removed the top-bar Create request button and its New request / task / announcement menu. Creating a request now happens from the Requests list's view bar (unchanged).
- In its place: a workspace search field (magnifying glass, "Search this workspace"). Typing matches record names and IDs across the workspace (max 6 results, with stage shown); picking a result opens its Request detail. Shows a no-matches state; closes on outside click.
- Note: full global search (comments, attachment filenames — S29) stays out of scope; this searches records only.

## 2026-07-02 · Darker header fills; 25 per page

- Header-row fill deepened to a navy-tinted gray (8% navy over the card surface) so it separates from the page background — applied to the Requests list header, the dashboard grid header, and the four Home panel headers. Theme-aware in dark mode.
- Requests list pagination now shows 25 records per page.

## 2026-07-02 · Teammate feedback (Stephanie)

- Home panel header rows (Needs your decision / Your work today / Since you were last here / New to triage) now filled with the light-gray page tone, matching the list headers.
- Top-bar quick-create button relabeled "Create" → "Create request". The menu behind it (New request / New task / New announcement) is unchanged — flag if the label change should also collapse it to a direct action.

## 2026-07-02 · List chrome refinements (per attached reference)

- Saved-view picker rebuilt to match the reference (minus per-item icons): trigger shows view name + "DEFAULT · SHARED" meta; menu groups Shared (All open requests — default, Unassigned, Due this week) and Personal (My requests), each row with active check, tag, and live record count; footer actions Modify columns / Edit this view / Save as new view (stubs, last one in accent).
- Column header rows on both the Requests list and the dashboard's embedded grid now fill with the page-gray surface (var(--bg-page)).
- The dashboard's embedded grid now scrolls inside itself (max 440px, sticky gray header) instead of stretching the page — matching the Requests list, which already owned its scroll.

## 2026-07-02 · Dashboard layout — uniform tiles (per attached reference)

- Row 1 is now four equal-width cards, ordered: Pipeline by stage (segmented bar, legend in two columns) · Escalations this quarter (big number, +delta vs prior quarter, per-origin summary below) · Unassigned past Intake (big number, subtitle, per-Dept/PG/Client breakdown) · Closures this quarter. Each carries a 16px icon in its eyebrow, matching the reference.
- Row 2: the Requests by Dept/PG/Client × stage heatmap goes full width; the records grid follows.
- All drill-throughs preserved: pipeline segments/legend, escalation origin chips, unassigned number + breakdown, closure bars, heatmap cells.
- Decision: replaced the four-quarter escalation trend bars with the single-number treatment the reference shows; the trend now reads through the "+3 vs prior quarter" line. Collapses 4 → 2 → 1 columns at 1280 / 700px.

## 2026-07-02 · User identity → top bar

- Removed the name/role block from the bottom of the sidebar. Identity now lives entirely in the top-right avatar: clicking it opens an account menu with name + role (Priya Raman, AI Solutions Analyst) and Profile / Sign out stubs.
- The collapse chevron now sits alone at the sidebar's foot.

## 2026-07-02 · Announcements → bell; workspace switcher

- Removed Announcement log from the Admin nav. The bell in the top bar now opens a small menu: Notifications and Announcement history (both stubs — S26/S28 are out of scope).
- Added a workspace switcher in the sidebar, directly under the lockup: a bordered control showing "AI Solutions · hub" with a caret, opening a "Your workspaces" menu (AI Solutions — hub, Litigation — PG, M&A — PG; switching is stubbed since PG workspaces aren't in this prototype). Collapses to an icon-only building button on the 72px rail.
- Decision: the switcher is NOT a dropdown on the app name — the lockup is the fixed product identity (symbol + divider + name, per the system's application-lockup rules) and shouldn't double as a control. Workspace is context, so it lives just below the identity, where the drawer also shows it on mobile.

## 2026-07-02 · Admin nav completed

- Added Views & dashboards (below Fields & objects) and Announcement log (above Audit log) to the Admin group. Both stubs. Admin order is now: Users & access, Fields & objects, Views & dashboards, Lifecycle & gates, Import & export, Announcement log, Audit log.

## 2026-07-02 · Collapsible, grouped navigation

- Sidebar collapses to a 72px icon rail (chevron toggle above the user slot; state persists). Collapsed rail shows the symbol-only lockup, icon-only nav items with tooltips, and section dividers in place of labels. Desktop only — below 1024px it stays the slide-in drawer.
- Nav grouped into three sections: Workspace (Home, Requests, Dashboards), Reference (Feature Catalog, Toolkit), Admin (Users & access, Fields & objects, Lifecycle & gates, Import & export, Audit log — all stubs).
- Note: the brief's workspace-admin set also includes Views & dashboards admin (S33) and Manage announcements (S34), not yet added pending confirmation. Platform admin (S37–S42) is a separate firm-wide layer that wouldn't appear in a workspace sidebar.
- Decision: no width animation on collapse (system rule — never animate width; transform/opacity only), so the rail snaps.

## 2026-07-02 · S13 AI Solutions default dashboard

- Added the final screen; Dashboards in the sidebar is now live. Full-width surface with side gutters (heatmap needs the canvas), not the 1200px reading cap.
- Fixed layout: Unassigned KPI tile (past-Intake, no analyst), Escalations per quarter by origin (segmented bars, categorical series colors), Pipeline by stage (single segmented bar + counts, accent ramp), Closures this quarter by outcome (Live / Declined / Withdrawn / Duplicate), Requests by Dept/PG/Client × stage heatmap (including the surfaced "— (unset)" row, zeros as em-dash), and the embedded records grid with Export view.
- Drill-through is live everywhere: KPI tile, escalation segments, pipeline segments/legend, closure bars, heatmap cells — each filters the embedded grid, shown as a removable pill; grid rows open S6. Pipeline counts reflect real session state (a gate approval that advanced a stage moves it here too).
- Outcome drill-throughs pull from a seeded closed-records set (8 records this quarter); closed rows aren't clickable since closed-record detail is out of scope.
- "Pin as home" affordance repeated next to the dashboard title, per the Home brief ("any dashboard or saved view").
- Escalations-per-quarter counts are seeded history (not derived from the 18 open records) so the trend reads meaningfully.

All six screens are now in place.

## 2026-07-02 · S7 Tasks & gates tab

- Filled in the Tasks & gates tab on S6 (same header, meta strip, sticky stepper, side panel — only the main-card content changes, per brief).
- Open gate block: gate name, "fires on · Build → QA" transition pill, AND-join note, approver slot rows (person, role label, approved-with-signer-and-timestamp or inline Approve / Reject with optional comment). Approving the final AND slot resolves the gate live — the stepper advances Build → QA, the Requests list reflects the new stage, and a pale-success resolution strip replaces the gate.
- Task list: done / open / locked checkbox states, assignee avatar + name, status pills; clicking a locked task's lock reveals its plain-language precondition; the sign-off task carries inline Approve / Reject (seal icon + awaiting-sign-off pill) so it reads distinct from ordinary tasks while sharing the list.
- REQ-0977 carries a second seeded gate (Deploy → Post-launch) so both Home "Needs your decision" items land on a live gate; the Home item's gate label was corrected to match.
- Decision: rejecting a slot records "Rejected · signer · time" and leaves the gate open (no auto-return flow — that's an Activity/notification concern outside this prototype).
- Note: gate approvals and stage advances persist for the session; reopening a record after resolving its gate shows the resolved strip, not a re-armed gate.

## 2026-07-02 · S6 Request detail (escalated)

- Added S6; wired in from everywhere the brief names: S4 row click, quick-peek "Open request", Home panel items (Needs-your-decision opens the Tasks & gates tab; others open Fields), typed-link cross-navigation, and Submit on S5 now lands on the minted record's detail.
- Header block: mono ID + "Escalated · [origin]" pill, record name, meta strip (Display status / Assigned analyst / Priority score / Due date / Origin), sticky six-stage lifecycle stepper (system Stepper — circles on a continuous track).
- Escalation-bridge panel: PG record (locked crossing-field snapshot, PG stage "stays live", read-only status mirror pill) | spine (canonical ID, field-lock, mirror-back) | AI record (live stage, analyst, editable AI-side fields), with the mirror band stating the Deploy/Post-launch → "Deployed" coarsening.
- Two-column body: tabbed main card (Fields default; Tasks & gates arrives with S7; Activity is out of scope per brief) + side panel (Typed links with "Link a record", Attachments labeled by type, Watchers with a working watch toggle).
- Non-escalated records reuse the layout without the bridge panel (per brief's S8 note — same layout minus bridge).
- Decision: breadcrumb "Requests › [ID]" sits above the header block for the way back; sidebar Requests stays active across list/intake/detail.

## 2026-07-02 · S5 Intake form

- Added S5; "Create request" (S4 view bar) and top-bar Create → New request now open it.
- Four numbered sections (Intake, Value mapping, Solution details, Triage) with paired two-column rows; Client number appears as a revealed block when Dept/PG/Client = Client.
- Priority Score widget: three 1–5 sliders with live-computed score and the formula shown alongside.
- Always-on Similar requests panel (right, sticky): keyword matches on Name + Description as you type, max 3, each with dismiss / open (stub) / link-as-related.
- Submit validates Name, Description, Dept/PG/Client inline (what happened → why → how to fix, per system voice) and mints REQ-1062 into the Requests list. Save draft returns to the list without minting.
- Decision: per the design system's content rules ("optional is marked, not required — no asterisks"), optional fields carry the (optional) marker instead of the brief's required markers. Required-ness surfaces through inline validation on submit.
- Decision: Submit currently lands on S4 Requests list (S6 doesn't exist yet); will rewire to land on S6 Request detail when it's built.

## 2026-07-02 · S4 Requests list

- Added S4 to the same prototype; sidebar Home ↔ Requests navigation is now live.
- View bar: saved-view picker (All open / My requests / Unassigned / Due this week — canned filter presets), active-filter pills with per-pill remove + Clear all, Create request on the right (stub until S5).
- Grid: full-width data surface, scrolls inside its own shell (page chrome, header, view bar, column headers, pagination all fixed). Sort cycle asc → desc → cleared on every column; per-column funnel popovers — checkbox lists with contextual per-value counts (Stage, Dept/PG/Client, Analyst), typed comparator shorthand like `>5` (Priority), from/to date pickers (Due), substring (Name).
- Aging tint: due-soon rows pale-gold, overdue pale-orange, with a text suffix on the due cell so color is not the sole indicator.
- Quick peek: per-row eye button opens a side sheet summary; row click reserved for S6 (stub).
- Decision: grid built as a CSS-grid table rather than the Table component's native `<table>` so rows can stream/template cleanly; header, row, hover, and pagination styling match the system's table spec 1:1.
- Decision: filter popovers apply live (no Apply button) — matches the system's restraint; each has a Clear-filter action.

## 2026-07-02 · S3 Home (initial build)

- Built S3 Home as `AI Solutions Tracker.dc.html` on the McDermott design system (sidebar shell, 56px top bar, reading-cap content column).
- Sidebar nav: Home (active), Requests, Dashboards, Feature Catalog, Toolkit — future surfaces stubbed as labels only.
- Top bar: quick-create (New request / New task / New announcement popover), notification bell, theme toggle (real product control, persisted), account avatar.
- Home body: pinned-announcement strip, then the four panels — Needs your decision, Your work today (urgency-ordered), Since you were last here, New to triage.
- "Pin as home" affordance placed next to the page heading, shown in its pinned state (Home is the default landing surface).
- Decision: panels rendered as standard McDermott cards with divided rows rather than tables — these are glanceable queues, not working grids; the grid pattern is reserved for S4. Alternative considered: a compact Table for "Your work today"; rejected to keep Home calm and single-purpose.
- Decision: due-date urgency shown as pale-fill pills (pale-orange overdue, pale-gold due-today, navy text) instead of row tinting; row aging tint is the S4 list pattern.

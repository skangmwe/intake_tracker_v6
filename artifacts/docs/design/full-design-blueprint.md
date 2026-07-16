# Full Design Blueprint — AI Solutions Tracker

*Canonical planning document. Read alongside [`solution-requirements.md`](../product/solution-requirements.md) and [`ai_solutions_tracker_build_spec_final.md`](../dev/ai_solutions_tracker_build_spec_final.md). This blueprint captures what is prototyped and what is saved for build; the build spec governs implementation where the prototype does not.*

**Reconciled with prototype on 2026-07-03, from manually placed archive.** First reconciliation — 7 prototyped screens (S1–S6, S31).

**Reconciled with prototype on 2026-07-16, from manually placed archive (v2).** The v2 export (`Design brief handoff-handoff v2.zip`, normalized to `artifacts/docs/design/project/`) is a major expansion: the flat Admin nav became a **grouped Workspace/Platform settings surface**, and the full workspace + platform admin surfaces, the Feature Catalog, and a new Toolkit are now rendered — promoting 15 screens from save-for-/build to Prototype and adding a new Toolkit screen. The focal file `AI Solutions Tracker.dc.html` is the visual truth for every prototyped screen; where the older `design_handoff_admin_settings_shell/` sub-bundle disagrees with the focal file, the focal file wins. Changelog provenance is tagged `[from changelog: "<line>"]` on the rows and sections it drove.

---

## At a glance

| | |
|---|---|
| **Product** | AI Solutions Tracker — a multi-workspace request-intake-and-delivery platform for the AI Solutions team at McDermott Will & Schulte |
| **Prototyped screens** | 22 of 43 |
| **Directions per screen** | 1 (one confident answer) |
| **Demo persona** | AI Solutions Analyst — the daily user. Secondary personas: PG requestor (S3), AI Solutions Manager (S6), Workspace admin (Workspace settings), Platform admin (Platform settings) |
| **Platform** | Web, responsive (light + dark). No native mobile app. |
| **Design system** | McDermott — see `.claude/rules/design/_core-requirements.md` and the reference `mws-design-system-showcase.html` |
| **Prototype archive** | `artifacts/docs/design/project/AI Solutions Tracker.dc.html` (single-file `.dc.html` prototype; v2, 2026-07-16) |

## Core flow (the prototype walkthrough)

1. **PG requestor opens the [Intake form (S3)](#s3-intake-form)** in their workspace. As they type Name and Description, the always-on Similar requests panel on the right surfaces up to three likely matches. They dismiss, link as `related`, or continue and submit. Client number appears as a revealed block when Dept/PG/Client = Client. A live-computed Priority score widget shows the formula alongside three 1–5 sliders. Inline validation (what happened → why → how to fix) fires on submit; on success a new record is minted and the user lands on the Requests list. Intake now picks a **Lifecycle** (relabeled from "Request type" — the lifecycle name is the single label) [from changelog: "Lifecycles: dropped the separate request type"].
2. **Submit lands them on their [Requests list (S2)](#s2-requests-list)** with the newly-minted record visible. Aging tint on rows (pale-gold due-soon, pale-orange overdue) conveys SLA state at a glance. Saved-view picker + Export view sit in the view bar. Per-column funnel filters offer type-aware inputs (comparator shorthand `>5`, from/to dates, substring, multi-select checkbox with per-value counts) across every column including Description and Repo URL. Row click opens the record.
3. **Opening a record shows [Record detail (S4)](#s4-record-detail)** — the sticky compact lifecycle stepper up top and a **config-driven tab bar** that renders from the relationship catalog: base tabs **Status / Intake / Activity / Watchers & alerts**, with **Tasks & gates** and **Attachments** surfaced as relationship-driven tabs (a generic related-records panel powers any relationship tab). The **Status** tab carries the record's In-progress / On-hold / Abandoned state (On hold pauses task completion and gate approvals). The **Intake** tab is editable — fields render as live form controls with an autosave "All changes saved" indicator on the tab row. **Tasks & gates** groups tasks by build phase (collapsible headers on navy) with tab composers (Add task / Add bundle) in a gray-boxed panel; per-task Notes & decisions expandable; gates render inline within their target phase group. **Watchers & alerts** carries the watch toggle plus per-record notification preferences. A right side panel shows **Relationships** ("Link a record").
4. **An escalated record shows [Escalated record (S5)](#s5-escalated-record)** — same layout as S4 with two additions: the header carries an **"Escalated · [origin]"** status pill (Origin is not repeated in the meta strip), and the Intake tab shows crossing fields with a pale-gold **"⇄ Crossed · locked on PG"** marker (fully editable AI-side; the lock is conceptual and applies on the PG side only). A slim mirror note at the top of the Intake tab summarizes provenance (shared ID · crossed-fields-locked-on-PG · PG follows via status mirror · Deploy/Post-launch → "Deployed" on PG until closure). **There is no standalone three-part bridge panel** — the prototype iteration replaced it with the inline treatment [from changelog: "Replaced the collapsible escalation-bridge panel with an Intake tab on Request detail"].
5. **The Analyst's [Home (S1)](#s1-home)** is where every user lands after sign-in. Sidebar-shell layout with the McDermott lockup + workspace switcher at the top. The sidebar's **Admin group is now two grouped entries — Workspace and Platform** — each opening a settings surface (see below); the Reference group's Feature Catalog and Toolkit now open real surfaces. Top bar: workspace search (records only, max 6 results — global comment/attachment search stays save-for-/build), notification bell, theme toggle (real product control, persisted), account avatar. Home body: pinned-announcement strip, then four panels — **Needs your decision · Your work today (urgency-ordered) · Since you were last here · New to triage**. "Pin as home" affordance next to the page heading.
6. **The Manager's [AI dashboard (S6)](#s6-dashboards)** is now a **multi-dashboard surface** — a title-dropdown switcher (Shared / Personal) + **New dashboard** (name + visibility). The seeded AI Solutions default keeps its bespoke layout (four equal tiles in Row 1 · full-width Dept/PG/Client × stage heatmap · embedded records grid); custom dashboards are config-driven with an **Edit layout** mode (reorder / edit / remove widgets) and an **Add widget** composer (widget type · metric or group-by dimension · row limit · half/full width · department + stage scope), computing live from request data. Drill-through is live everywhere on the seeded dashboard [from changelog: "Dashboards: full composer"].
7. **The admin's Workspace settings** open from the sidebar's **Workspace** entry — a secondary side-nav lists the group's pages ([Users & access (S29)](#s29-users--access) · [Fields & objects (S30)](#s30-fields--objects) · [Views & dashboards (S32)](#s32-views--dashboards) · [Lifecycle & gates (S31)](#s31-lifecycle--gates) · [Announcements (S23)](#s23-announcements) · [Import & export (S28)](#s28-import--export) · [Audit log (S33)](#s33-workspace-audit)). Every page is a full working surface built on the shared list-surface pattern (sort · funnel filters · resizable columns · side-sheet editors); Lifecycle & gates is the dedicated lifecycle/gate editor. [from changelog: "Admin section → grouped settings pattern"]
8. **The platform admin's Platform settings** open from the sidebar's **Platform** entry (shown only to platform admins) — a secondary side-nav lists [Workspaces (S38)](#s38-workspaces) · [Fields & objects (S34)](#s34-platform-fields--objects) · [Crossing map (S35)](#s35-crossing-map) · [Authentication (S36)](#s36-authentication) · [Audit (S39)](#s39-platform-audit). Platform Fields & objects mirrors the workspace schema editor scoped to global data; Crossing map opens a read-only drill-in detail panel per rule. [from changelog: "Platform: full Fields & objects surface"; "Crossing map: drill-in detail panel"]

## What's in and why

| ID | Name | Value | Uncertainty | Why in prototype |
|---|---|---|---|---|
| S1 | Home | 5 | 4 | Novel composition of viewer-scoped queries (needs your decision / today / catch-up / new-to-triage / announcements) — sets the daily rhythm. |
| S2 | Requests list | 5 | 3 | Day-to-day working surface. In-list scroll, aging tint, per-column funnel filters, two-layer saved views, resizable columns, long-text wrapping — several specific §22 rules that needed to feel right. |
| S3 | Intake form | 5 | 4 | First user touch. Two-column with always-on Similar requests nudge is the duplicate defense and the riskiest UX call. |
| S4 | Record detail | 5 | 3 | Where the work happens. Compact sticky stepper + config-driven tabs (Status / Intake / Tasks & gates / Attachments / Activity / Watchers & alerts) + Relationships side panel. Tasks grouped by build phase; typed per-task fields; task bundle templates; a record Status/hold model and per-record alert preferences emerged during iteration. |
| S5 | Escalated record | 5 | 5 | ★ Highest uncertainty in the product. Iteration collapsed the three-part bridge visualization into inline crossed-field markers + a slim mirror note on the Intake tab [from changelog: "Replaced the collapsible escalation-bridge panel with an Intake tab (Stephanie)"]. |
| S6 | Dashboards | 4 | 3 | Manager's decision surface, now a multi-dashboard composer. Seeded AI-default keeps four uniform tiles + full-width heatmap + records grid; custom dashboards build from a widget palette (KPI / breakdown bars / pipeline segments / records table) [from changelog: "Dashboards: full composer"]. |
| S9 | Feature catalog | 4 | 3 | Reuse inventory. Gallery/list toggle, funnel-filterable sortable list, New/Edit feature side-sheet, detail side-sheet [from changelog: "Feature catalog + Toolkit: editors, list view"]. |
| S10 | Feature detail | 3 | 2 | Rendered as a side sheet within the Feature catalog surface — full field set, attachments, how-to-reuse. |
| S11 | Feature gallery | 4 | 3 | Rendered as the gallery-view toggle of the Feature catalog surface. |
| S23 | Announcements | 3 | 2 | Workspace admin authoring surface — list + New/Edit editor with scheduled publish and auto-archive [from changelog: "Announcements: scheduled publish date"; "auto-archive after 30 days"]. |
| S28 | Import & export | 3 | 2 | Import / Export tabs; working import wizard (target object · CSV/Excel · auto-map · row count · Import rows) [from changelog: "Import & export: working import wizard"; "split into tabs"]. |
| S29 | Users & access | 3 | 2 | Tabbed Members / Approver teams; membership levels; per-row status actions; access requests. Approver-team management moved here from the lifecycle editor [from changelog: "Approver teams moved to Users & access"; "Users: member actions"]. |
| S30 | Fields & objects | 4 | 3 | Full schema editor: Fields / Objects / Relationships tabs, system-provisioned fields, field types including Link-to-record, object-level relationships that auto-provision managed link fields [from changelog: "Fields & objects: objects are now creatable"; "Relationships surface + auto-provisioned fields"; "Link to record field type"]. |
| S31 | Lifecycle & gates | 4 | 3 | Now inside Workspace settings. Multiple lifecycles via a dropdown selector; team-only approver-slot model; rejection follow-up; approver-teams section now a read-only reference pointing to Users & access [from changelog: "Lifecycles: dropdown selector"; "Approver teams moved to Users & access"]. |
| S32 | Views & dashboards | 3 | 2 | Read-only reference list of shared/private views + dashboards with per-row admin actions (Edit / Make personal-shared / Archive / Delete) [from changelog: "Views & dashboards: admin row actions"; "read-only reference list"]. |
| S33 | Workspace audit | 3 | 2 | Full audit list with structured Object + Record ID columns, sort/filter [from changelog: "Audit log: structured Object + Record ID"]. |
| S34 | Platform Fields & objects | 4 | 3 | Platform-scoped schema editor mirroring the workspace — global fields + system fields (Fields tab), global objects Request/Task (Objects tab), separate store [from changelog: "Platform: full Fields & objects surface"; "Object scope: global vs workspace"]. |
| S35 | Crossing map | 4 | 4 | Cross-workspace field-mapping rules grid with a Field-mappings count and a read-only drill-in detail panel (source → target field table) [from changelog: "Crossing map: drill-in detail panel"]. |
| S36 | Authentication | 3 | 2 | Platform → Authentication: the SSO-provisioned People directory + platform-admin grants (People / Admins tabs), SSO & session policy. |
| S38 | Workspaces | 4 | 3 | Platform → Workspaces: active-workspaces list (AI Solutions hub · Litigation · M&A) + New workspace. |
| S39 | Platform audit | 3 | 2 | Platform → Audit: all-workspaces audit (90 days) with the Object + Record ID + Workspace columns. |
| S43 | Toolkit | 3 | 2 | ✚ New. Reference surface matched to the Feature catalog layout — search, gallery/list toggle, New item (paste-or-upload), download, edit-in-place, funnel-filterable sortable list. Pulled into R1 Phase 2 per the 2026-07-07 re-phasing [from changelog: "Feature catalog + Toolkit: editors, list view"]. |

## What's saved for /build — brief

21 screens across the remaining groupings: **Entry / nav** (2 — S7 Sign in, S8 Workspace switcher full flow) · **Feature Catalog** (2 — S12 Feature dashboard, S13 Add to catalog) · **Other dashboards** (4 — S14 Workload, S15 PG starter, S16 Dashboard viewer, S17 Dashboards list) · **Bridge & Copy** (2 — S18 Escalate modal, S19 Copy modal) · **Notices** (3 — S20 Bell centre, S21 Announcement detail, S22 Announcements read-list) · **Auxiliary record surfaces** (3 — S24 Saved-view editor, S25 Task detail, S26 Drafts) · **Search** (1 — S27 Search results) · **Platform admin** (1 — S37 Role-label catalog) · **Edge states** (3 — S40 No-access, S41 Empty list, S42 Filtered to zero). Full per-screen specs in [Save for /build screen details](#save-for-build-screen-details).

## Skill settings used

- **screen_budget:** 6 (default). The prototype went far beyond budget during iteration — 22 rendered by the v2 export — as the whole admin/settings, Feature Catalog, and Toolkit surfaces were built out. This is codified rather than reverted; the approved artifact wins.
- **directions:** 1 per screen (default, unmodified).
- **variant_exploration:** off (default). ★ S5 Escalated record was the highest-uncertainty candidate; iteration converged on a single decisive answer (inline crossed-field markers replacing the bridge panel).

## Open questions

1. **"Relationships" side-panel label** — the changelog notes alternatives were offered: Related records, Linked records, Connections, Related items — awaiting confirmation on final wording. Blueprint uses "Relationships" per the prototype's current state.
2. **Team-only approver-slot model in the build spec.** The prototype settled on team-only slots; the build spec (§7.2) allows both team slots and named-individual slots. Confirm at architecture review whether the team-only pattern is the final spec or the named-individual option remains available. `[PENDING — reconcile with build spec §7.2]`.
3. **Global search across comments and attachment filenames (S27) confirmed save-for-/build.** The top-bar workspace search is records-only; the full global search per build spec §9.5 stays deferred.
4. **S37 Role-label catalog vs. Approver teams.** The v2 prototype manages gate role labels implicitly through **Users & access → Approver teams** (workspace-owned), and the workspace *role catalog* (announcement audiences) was explicitly removed [from changelog: "Roles removed"]. A separate Platform **Role-label catalog** (S37) is not rendered and appears superseded — but the changelog cites no explicit deletion of the *gate role-label* concept, so it is carried forward as save-for-/build. `[PENDING — confirm whether S37 is fully absorbed into Approver teams or remains a platform surface.]`
5. **Announcement audience scope.** After the role-catalog removal, announcements are workspace-wide (settings footnote: "visible to everyone in this workspace"). Confirm whether targeted audiences return in a later release.
6. **Do dark-mode variants need any adjustment?** Assumed the prototype's theme toggle handles both — the build ports both light and dark treatments directly from the prototype.

---

## Full screen map — master table

*Every screen. Columns: ID · Name · Role · Contains · Connects-to · Tag · V · U · Source · **Prototype source** · **App route / component**.*

**Prototype source** points to the file (and, where applicable, the section identifier or on-screen name) each in-scope screen should be visually diffed against. Save-for-/build screens with no prototype presence have a blank Prototype source — visual review skips them. **This column is a navigation aid, not a source of truth — it tells a reviewer where to look, not what to build.** **App route / component** is filled in by the build pipeline.

Platform is **Web (responsive)** for every screen — omitted from the table to save width. Every prototyped settings page's Prototype source is the single focal file `project/AI Solutions Tracker.dc.html`, at the named settings group → page.

| ID | Screen | Role | Contains | Connects to (action) | Tag | V | U | Source | Prototype source | App route / component |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 | Home | Analyst | Pinned-announcement strip · four panels (Needs your decision · Your work today · Since you were last here · New to triage) · Pin-as-home affordance · sidebar shell with lockup + workspace switcher + grouped nav (Workspace · Reference · Admin→Workspace/Platform) · top bar (workspace search · bell · theme toggle · avatar) | S2 · S3 · S4 · S6 · Workspace settings · Platform settings | **Prototype** | 5 | 4 | requirement | `project/AI Solutions Tracker.dc.html` — Home | |
| S2 | Requests list | Analyst | Full-width data grid · saved-view picker (Shared: All open / Unassigned / Due this week — Personal: My requests) · active-filter pills + Clear all · Export view · Create request · resizable columns · in-list scroll · aging tint · per-column funnel filters on every column (incl. Description, Repo URL, Tags) · Repo URL column (task-field rollup) · 25 rows per page · monospace record count | S3 (Create request) · S4 (Open record) · S5 (Open escalated) | **Prototype** | 5 | 3 | requirement | `project/AI Solutions Tracker.dc.html` — Requests | `/requests` (RequestsListPage) |
| S3 | Intake form | PG requestor | Four numbered sections (Intake · Value mapping · Solution details · Triage) · **Lifecycle** picker (single label) · paired two-column rows · Client number revealed when Dept/PG/Client = Client · Priority Score widget (3× 1–5 sliders + live score + formula) · always-on Similar requests panel (right, sticky) · Submit vs Save draft · inline validation (what+why+how) · optional-marker convention (no `*`) | S4 (Submit) · S2 (Save draft) | **Prototype** | 5 | 4 | requirement | `project/AI Solutions Tracker.dc.html` — New request | `/requests/new` (IntakeFormPage) |
| S4 | Record detail | Analyst | Breadcrumb · Header (mono ID + status pills + name) · compact meta strip (Display Status · Assigned Analyst · Priority Score · Due Date · **Submitted**) · sticky compact lifecycle stepper · **config-driven tab bar** (base: **Status / Intake / Activity / Watchers & alerts**; relationship-driven: **Tasks & gates**, **Attachments**) · Status tab (In-progress / On-hold / Abandoned; hold pauses tasks + gates) · Intake tab editable with autosave · Tasks & gates (phase-grouped collapsible · Add task/Add bundle composer · typed per-task fields URL/Text/Number/Date/Select/Checkbox · Notes & decisions · inline gates) · Attachments via generic related-records panel · Watchers & alerts (watch toggle + notification preferences) · side panel **Relationships** (Link a record) | S2 (Back) · linked-record cross-nav | **Prototype** | 5 | 3 | requirement | `project/AI Solutions Tracker.dc.html` — Request detail (non-escalated) | `/requests/:recordId` (RecordDetailPage) |
| S5 | Escalated record | Analyst | Everything S4 shows, plus: **"Escalated · [origin]" status pill** in the header · slim mirror note atop the Intake tab · pale-gold **"⇄ Crossed · locked on PG"** marker on each crossing field (editable AI-side) · pending-slot "Select your name" approver flow | S2 (Back) | **Prototype** | 5 | 5 | requirement | `project/AI Solutions Tracker.dc.html` — Request detail (escalated, e.g. REQ-0977 / REQ-1042) | |
| S6 | Dashboards | Manager | **Multi-dashboard surface:** title-dropdown switcher (Shared / Personal) · **New dashboard** (name + visibility) · seeded AI-default (four equal tiles: Pipeline by stage · Escalations this quarter · Unassigned past Intake · Closures this quarter · full-width Dept/PG/Client × stage heatmap · embedded records grid with Export view) · **Edit layout** mode (reorder/edit/remove) · **Add widget** composer (type KPI/breakdown/pipeline/table · metric or group-by · row limit · half/full width · dept+stage scope) · Pin-as-home · live drill-through on seeded tiles | S2 (Drill to list) · S4 (Open record) | **Prototype** | 4 | 3 | requirement | `project/AI Solutions Tracker.dc.html` — Dashboard | |
| S9 | Feature catalog | Analyst | Reference surface · search · **gallery / list view toggle** · item count · New feature (side-sheet editor) · funnel-filterable, click-to-sort list · internally-scrolling list (page scroll locked) | S10 (Open feature) · S11 (Gallery view) | **Prototype** | 4 | 3 | requirement | `project/AI Solutions Tracker.dc.html` — Feature Catalog | |
| S10 | Feature detail | All roles | Feature detail **side sheet** — full field set, attachments, sourced-from links, how-to-reuse, demo/repo URLs | S9 (Back to catalog) | **Prototype** | 3 | 2 | requirement | `project/AI Solutions Tracker.dc.html` — Feature Catalog (feature side sheet) | |
| S11 | Feature gallery | All roles | **Gallery view** of the Feature catalog — card grid with attachment thumbnails, filters, tap to open detail side sheet | S10 (Open feature) | **Prototype** | 4 | 3 | requirement | `project/AI Solutions Tracker.dc.html` — Feature Catalog (gallery view) | |
| S23 | Announcements | Workspace admin | Workspace → Announcements · list surface (Announcement message · Audience · Status · Publish date · pinned) · New/Edit editor (3-line Announcement textarea · Status Draft/Scheduled/Published/Archived · **Publish date & time** when Scheduled · **Auto-archive after 30 days** toggle with computed archive date · pin flag) | S1 (Home strip) · Bell history | **Prototype** | 3 | 2 | requirement | `project/AI Solutions Tracker.dc.html` — Workspace settings → Announcements | |
| S28 | Import & export | Workspace admin | Workspace → Import & export · **Import / Export tabs** · Import tab: job history + **Import wizard** (target object · drop CSV/Excel · auto-map columns w/ per-column overrides + Skip · row count · Import rows logs job) · Export tab: job history + Export current view | S2 (View records) | **Prototype** | 3 | 2 | requirement | `project/AI Solutions Tracker.dc.html` — Workspace settings → Import & export | |
| S29 | Users & access | Workspace admin | Workspace → Users & access · tabbed **Members / Approver teams** · Members list (Name · Email · **Membership level** Viewer/Member/Workspace admin · Status · Last active) with per-row kebab (Edit · Resend invitation · Suspend · Reactivate · Remove) · Add member (Name + Email; defaults Invited) · Approver teams (inline-editable names · member rows name+email+avatar · Add member · "N gate slots filled") · Access levels editor · Access requests (2 pending) | S31 (Manage teams) | **Prototype** | 3 | 2 | requirement | `project/AI Solutions Tracker.dc.html` — Workspace settings → Users & access | |
| S30 | Fields & objects | Workspace admin | Workspace → Fields & objects · segmented **Fields / Objects / Relationships** · **Fields:** list (Field · Key chip · Type · Object · Location · Source [System w/ lock / User] · Section · Status), click-to-sort, funnel filters, drag-resize, side-sheet editor (immutable key · Type incl. **Link to record** · Required · Options for selects · Visible-on-stages [lifecycle objects only] · Conditional rules · Archive/Restore/Delete) · system-provisioned fields (Record ID · Name · Date created · Last updated · Created by) read-only · **Objects:** list (Object · Plural · Records · Fields · Location · Description), side-sheet editor (Show-in-left-sidebar toggle + Sidebar category for custom; built-ins locked) · **Relationships:** name · From/To objects · cardinality · both side labels · auto-suggest "[Parent] has [Children]" · auto-provisions managed Link-to-record fields · "Show on [parent] detail as a tab" toggle + tab label | S4 (drives detail tabs & task field library) | **Prototype** | 4 | 3 | requirement | `project/AI Solutions Tracker.dc.html` — Workspace settings → Fields & objects | |
| S31 | Lifecycle & gates | Workspace admin | Workspace → Lifecycle & gates · **multiple lifecycles via dropdown selector** (label = lifecycle name; default marked) · add lifecycle/stage · **Stages** as numbered circles on a continuous track with a gate icon on gated transitions · **Gates** live editor (editable name · from→to selects · approver-slot list identifying **teams only** [role label + "N eligible" + remove] · AND-join note · add/remove) · seeded QA-readiness (Build→QA) + Post-launch-readiness (Deploy→Post-launch) · **Approver teams section is a read-only reference** with a **Manage teams** button to Users & access · rejected-slot resurfacing ("Changes requested" + Re-request approval) | S29 (Manage teams) · affects S4/S5 Tasks & gates live | **Prototype** | 4 | 3 | requirement | `project/AI Solutions Tracker.dc.html` — Workspace settings → Lifecycle & gates | `/admin/lifecycle` (LifecyclePage) |
| S32 | Views & dashboards | Workspace admin | Workspace → Views & dashboards · **read-only reference list** (Name · Object · Kind · Visibility · Owner · Status) with funnel filters · per-row admin kebab (**Edit** side-sheet [Object/Kind read-only; visibility/owner/name editable] · Make personal / Make shared · Archive / Restore · Delete view) · no "New view" (creation lives on object/dashboard screens) | S6 (Open dashboard) | **Prototype** | 3 | 2 | requirement | `project/AI Solutions Tracker.dc.html` — Workspace settings → Views & dashboards | |
| S33 | Workspace audit | Workspace admin | Workspace → Audit log · list surface (Timestamp · Actor · Event · **Object** · **Record ID** · Details) · click-to-sort · funnel filters (Event / Actor / Object / Date) · 238 events / 30 days | S4 (Open record) | **Prototype** | 3 | 2 | requirement | `project/AI Solutions Tracker.dc.html` — Workspace settings → Audit log | |
| S34 | Platform Fields & objects | Platform admin | Platform → Fields & objects · schema editor mirroring the workspace, scoped to **global data** · **Fields** tab (global/platform-inherited fields + system fields; Object column; click-to-sort; funnel filters incl. Global field / Type / Object / Locked) · **Objects** tab (global objects: **Request · Task** only) · edits persist to a separate store from the workspace | (platform) | **Prototype** | 4 | 3 | requirement | `project/AI Solutions Tracker.dc.html` — Platform settings → Fields & objects | |
| S35 | Crossing map | Platform admin | Platform → Crossing map · rules grid (source → target · trigger · status · **Field mappings** count) · click a rule → **read-only detail side panel** (source→target header · trigger · status · complete field-mapping table) · 5 active mappings | (platform) | **Prototype** | 4 | 4 | requirement | `project/AI Solutions Tracker.dc.html` — Platform settings → Crossing map | |
| S36 | Authentication | Platform admin | Platform → Authentication · SSO-provisioned **People directory** + **Admin grants** (People / Admins tabs) · SSO & session policy (SAML, 8-hour) · platform-admin holders (4) | (platform) | **Prototype** | 3 | 2 | requirement | `project/AI Solutions Tracker.dc.html` — Platform settings → Authentication | |
| S38 | Workspaces | Platform admin | Platform → Workspaces · active-workspaces list (AI Solutions hub · Litigation · M&A) · **New workspace** action (clones the PG/Dept template) | (platform) | **Prototype** | 4 | 3 | requirement | `project/AI Solutions Tracker.dc.html` — Platform settings → Workspaces | |
| S39 | Platform audit | Platform admin | Platform → Audit · all-workspaces audit list (90 days) with **Object · Record ID · Workspace** columns · sort/filter | S4 (Open record) | **Prototype** | 3 | 2 | requirement | `project/AI Solutions Tracker.dc.html` — Platform settings → Audit | |
| S43 | Toolkit | Analyst | ✚ **New.** Reference → Toolkit · search · **gallery / list view toggle** · item count · New item (paste-or-upload) · download on existing items · one-liner (AI-populated later) · Last modified on/by · edit-in-place · funnel-filterable, click-to-sort, internally-scrolling list · Toolkit item object (playbooks / plugins / prompts) | (reference-local) | **Prototype** | 3 | 2 | requirement | `project/AI Solutions Tracker.dc.html` — Toolkit | |
| S7 | Sign in | All roles | SSO redirect handoff | S1 (SSO success) | Save for /build | 2 | 1 | inferred-infrastructure | — | |
| S8 | Workspace switcher | All roles | Bordered control in sidebar under lockup showing current workspace + caret · popover menu "Your workspaces" listing hub + PGs · collapses to icon-only building button on the 72px rail. *A stub of this control appears in every prototyped sidebar; the full switching flow and admin-side workspace management stay save-for-/build.* [from changelog: "Announcements → bell; workspace switcher"] | S1 (Switch) | Save for /build | 3 | 2 | inferred-infrastructure | — (stub visible in every prototyped screen's sidebar) | |
| S12 | Feature dashboard | Firm-wide viewer | KPI tile · bar breakdown by type · bar breakdown by tech/stack · records grid (Published only) | S9 (Browse catalog) | Save for /build | 4 | 2 | requirement | — | |
| S13 | Add to catalog | Analyst | Prefilled Feature draft (from source Request) · edit fields · submit. *The generic New/Edit feature editor exists in S9; the "harvest from a shipped Request" prefill flow stays save-for-/build.* | S9 (Save feature) | Save for /build | 3 | 2 | requirement | — | |
| S14 | Workload dashboard | Manager, Analyst | Open records per analyst (bar) · Unassigned KPI · Pending sign-off KPI · Median time-to-first-triage (KPI-with-trend) · Aging in stage (histogram) · records grid. *Buildable as a saved dashboard via S6's composer.* | S2 (Drill to list) | Save for /build | 4 | 3 | requirement | — | |
| S15 | PG starter dash | PG admin, member | Requests by Dept/PG/Client · Escalation status KPI · records grid | S2 (Drill to list) | Save for /build | 3 | 2 | requirement | — | |
| S16 | Dashboard viewer | Viewer | One bound dashboard as the entire surface — no rail, no drill-through | (none) | Save for /build | 3 | 2 | requirement | — | |
| S17 | Dashboards list | Member, admin | List of dashboards visible to the viewer, with audience markers. *Partly realized by S6's Shared/Personal switcher dropdown; the full directory page stays save-for-/build.* | S6 (Open default) · S14 · S12 | Save for /build | 3 | 2 | inferred-infrastructure | — | |
| S18 | Escalate modal | Analyst | Confirm-and-lock: commit pending edits · confirm ID adoption · summary of what will lock | S5 (Confirm escalation) | Save for /build | 4 | 3 | requirement | — | |
| S19 | Copy modal | All roles | Include attachments toggle · optional link-back type (`related` / `re-pursuit-of`) · Cancel/Continue | S3 (Prefilled draft) | Save for /build | 3 | 2 | requirement | — | |
| S20 | Bell centre | All roles | Popover from top-bar bell — Notifications + Announcement history (two stubs visible in prototype's bell popover; full centre is save-for-/build) | S4 · S21 | Save for /build | 3 | 2 | requirement | — (stub visible in every prototyped screen's top bar) | |
| S21 | Announcement detail | All roles | Title, body, audience, published/expiry, author (read surface) | S22 (Back to list) | Save for /build | 2 | 1 | requirement | — | |
| S22 | Announcements read-list | All roles | Browsable history of Announcements (reader-facing; distinct from S23 admin authoring) | S21 (Open announcement) | Save for /build | 2 | 1 | requirement | — | |
| S24 | Saved-view editor | Member, admin | Tabbed side sheet: Filters (row-based builder) / Fields (shuttle) / Sort (reorderable rows) · scope + default toggles | S2 (Apply view) | Save for /build | 4 | 3 | requirement | — | |
| S25 | Task detail | Member, admin | Fields, thread, metadata for a child Task; precondition display if locked | S4 (Open parent) | Save for /build | 3 | 2 | requirement | — | |
| S26 | Drafts | All roles | Personal drafts — pre-record, discardable, resume to Intake | S3 (Resume draft) | Save for /build | 2 | 1 | requirement | — | |
| S27 | Search results | All roles | Access-respecting full-text results across fields, comments, and attachment filenames | S4 (Open record) | Save for /build | 3 | 2 | inferred-feature | — | |
| S37 | Role-label catalog | Platform admin | Managed catalog of gate role labels — **superseded in the prototype by Users & access → Approver teams**; carried forward pending confirmation (open question 4) | (platform) | Save for /build | 3 | 2 | requirement | — | |
| S40 | No-access page | All roles | Read-blocked response — never reveals record existence | S1 (Go home) | Save for /build | 2 | 1 | inferred-infrastructure | — | |
| S41 | Empty list | All roles | Zero-data empty state: "Create your first request" | S3 (Create first) | Save for /build | 2 | 1 | inferred-infrastructure | — | |
| S42 | Filtered to zero | All roles | Records exist but none match filters — bordered card, "Clear filters" secondary CTA | S2 (Clear filters) | Save for /build | 2 | 1 | inferred-infrastructure | — | |

## Prototype navigation graph

The v2 prototype is a full multi-surface app. Top-level surfaces reached from the sidebar: **Home · Requests · Dashboards** (Workspace group) · **Feature Catalog · Toolkit** (Reference group) · **Workspace settings · Platform settings** (Admin group).

- **S1 Home** → S2 · S3 (via Requests view bar) · S4 (from any panel) · S6 · S9 · S43 · Workspace settings · Platform settings [from changelog: "Admin section → grouped settings pattern"; "Top bar: quick-create → workspace search"]
- **S2 Requests list** → S3 (Create request via view bar) · S4 (row → non-escalated) · S5 (row → escalated)
- **S3 Intake form** → S4 (Submit mints record → lands on detail) · S2 (Save draft)
- **S4 Record detail** → S2 (Back, breadcrumb) · S4/S5 (linked-record cross-nav via Relationships side panel) · relationship tabs (Tasks & gates, Attachments)
- **S5 Escalated record** → S2 (Back) · S4/S5 (linked-record cross-nav)
- **S6 Dashboards** → S2 (drill from seeded tiles/segments/heatmap) · S4 (open record from grid) · switcher (Shared/Personal) · New dashboard · Edit layout / Add widget
- **S9 Feature catalog** → S10 (open feature side sheet) · S11 (gallery view toggle) · New feature editor
- **S43 Toolkit** → New item / edit-in-place / download (reference-local)
- **Workspace settings** (secondary side-nav) → S29 Users & access · S30 Fields & objects · S32 Views & dashboards · S31 Lifecycle & gates · S23 Announcements · S28 Import & export · S33 Audit log. Default landing: Users & access. S29 ↔ S31 cross-link (Manage teams / Approver teams).
- **Platform settings** (secondary side-nav, platform-admins only) → S38 Workspaces · S34 Fields & objects · S35 Crossing map · S36 Authentication · S39 Audit. Default landing: Workspaces.

Every top-level surface sits within one click of Home; every settings page within two (sidebar group → secondary side-nav). The sidebar carries every prototyped surface's entry point.

---

## Cross-cutting notes

*Behaviors and patterns that surfaced during prototype iteration and apply across multiple screens.*

### Sidebar shell (all prototyped screens)
- **McDermott lockup** at top (symbol + divider + name); collapses to symbol-only on 72px rail. [from changelog: "Collapsible, grouped navigation"]
- **Workspace switcher** directly under the lockup — bordered control showing "AI Solutions · hub" with caret; opens "Your workspaces" popover. Switching stubbed (PG workspaces aren't in this prototype).
- **Grouped nav sections:** **Workspace** (Home · Requests · Dashboards) · **Reference** (Feature Catalog · Toolkit) · **Admin** (**Workspace** · **Platform**). [from changelog: "Admin section → grouped settings pattern"]
  - The Admin group replaced the former flat six-item list with **two grouped landing entries**: **Workspace** (Phosphor `gear`) and **Platform** (Phosphor `shield-check`, **rendered only for platform admins**). One leading icon per item; never icon + number. On the collapsed rail both show icon-only with a tooltip ("Workspace settings" / "Platform settings").
  - Reference → **Feature Catalog** opens S9; Reference → **Toolkit** opens S43 (both now real surfaces, not stubs).
- **Collapse chevron** at sidebar foot (user identity moved to top-bar avatar). Desktop-only collapse to 72px rail; below 1024px it stays the slide-in drawer. No width animation on collapse (system rule). [from changelog: "User identity → top bar"]

### Settings surface (Workspace + Platform)
Selecting a sidebar Admin group opens a settings surface in the canvas [from changelog: "Admin section → grouped settings pattern"]:
- **Header block:** eyebrow ("WORKSPACE SETTINGS" / "PLATFORM SETTINGS", ALL CAPS) · H1 (Georgia) = active page label · subtitle = active page description.
- **Secondary side-nav** (`<aside>`, 236px, sticky) — text-only anchor links for the group's pages (no leading icons — labels are self-explanatory). Active page indicated by **≥2 cues, never color alone**: `--accent-interactive` color + 600 weight + a 3px left rail + an 8%-accent background tint. `aria-current="page"` on the active link.
- **Content column** — renders the active page's dedicated surface (list surface, schema editor, lifecycle editor, or People/Admins directory).
- **Groups & pages:**
  - **Workspace** (default landing = Users & access): Users & access (S29) · Fields & objects (S30) · Views & dashboards (S32) · Lifecycle & gates (S31) · Announcements (S23) · Import & export (S28) · Audit log (S33).
  - **Platform** (default landing = Workspaces; platform-admins only): Workspaces (S38) · Fields & objects (S34) · Crossing map (S35) · Authentication (S36) · Audit (S39).
- **Responsive:** below 1024px the sidebar becomes the drawer; in the settings body the row wraps so the 236px secondary nav stacks above the content column.
- **Nested-route mapping for build:** `/settings/workspace/:page` and `/settings/platform/:page`, secondary nav derived from the group's page list, active state from the route param; guard the platform routes/nav on the platform-admin claim.

### Shared list-surface pattern (every settings data page + S2 + S6's embedded grid)
Established during iteration [from changelog: "Shared 'list surface' pattern on every settings data page"; "Sort, filter & resizable columns on every settings list"]:
- The list fills the height below the top bar; **only the list scrolls** (the page never scrolls). Full-width grid with side gutters (not the 1200px reading cap).
- **Header fill:** navy-tinted gray (8% navy over surface); theme-aware. Sticky column-header row.
- **Click-to-sort** headers (asc → desc → cleared) with **type-aware funnel filters** (date range · any-of checklist with per-value counts · substring), auto-derived per column. Active-filter → accent funnel + "Clear all filters".
- **Drag-resizable columns** (70px min, per-page width state persists while navigating), last column flexible.
- **Long-text fields wrap to 3 lines** then ellipsis; **multi-select** shows first 2 pills + monospace "+N".
- Footer bar pinned to the grid's bottom edge: left = monospace record count ("1–25 of 128 records"); right = prev/next + "Page N of M". Horizontal scrollbar sits just above the footer.
- **Add/edit** where the list holds managed items: primary "New …" opens a side-sheet (or modal) editor; clicking a row opens the same editor prefilled; edits persist per session. Logs/records (Audit) stay read-only.
- Em-dash for empty cells; aging tints where SLA applies.

### Items-grid pattern (canonical for the working record lists — S2 and S6's embedded grid)
The Requests-list flavor of the list surface adds: saved-view picker + **Export view** in the view bar · aging tint (pale-gold due-soon, pale-orange overdue, text suffix so color isn't the sole indicator) [from changelog: "Column breaks removed; grid features unified across all items lists"].

### Record detail behaviors (S4 and S5 share code)
- **Compact lifecycle stepper**: 24px circles on continuous track, 12px labels; per system rule (circles on a track, never bordered rectangles). [from changelog: "Compact lifecycle stepper"]
- **Meta strip:** Display Status · Assigned Analyst · Priority Score · Due Date · **Submitted** (Origin lives in the "Escalated · [origin]" status pill for escalated records only). [from changelog: "Meta strip: Submitted date replaces Origin"]
- **Config-driven tab bar** [from changelog: "Config-driven detail tabs"]:
  - **Base tabs:** **Status · Intake · Activity · Watchers & alerts**.
  - **Relationship-driven tabs:** any relationship parented on Request with "Show on detail as a tab" enabled renders as a tab (inserted after its anchor, default after Tasks). **Tasks & gates** and **Attachments** are themselves relationship-driven entries. A single **generic related-records panel** (title · linked rows · inline "New ___" action · empty state · count) powers any relationship tab, so a future object gains a tab with zero new code. Inline create is a stub (no persistence) in the prototype.
  - **Status tab:** the record's status/hold model — **In progress · On hold · Abandoned**. **On hold** pauses task completion and gate approvals; **Abandoned** marks the solution dropped. Setting a non-active status surfaces an inline alert on the record.
  - **Intake tab is editable** — Description (textarea), Dept/PG/Client, Requestor, Value category, Solution type, Data sources, Who benefits, Assigned analyst, Due date render as live form controls seeded from the record. Priority at escalation, SLA status, and Submitted are read-only. Save indicator on the tab row, shown only after an edit ("All changes saved" + green cloud-check). [from changelog: "Fields + Intake merged into an editable Details tab"; "Save indicator moved to tab row"]
  - **Watchers & alerts tab:** the watch toggle ("Watch this record") + **per-record notification preferences** — Gate decisions · Status changes · Task sign-offs · SLA & due-date reminders · Mentions & comments.
- **Crossed-field marker (escalated only):** an orange ⇄ arrow icon with "Crossed field · locked on PG side" tooltip on each crossing field; the field stays editable AI-side. [from changelog: "crossed marker simplified"]
- **Tasks & gates tab:**
  - Tasks grouped by build phase (**Intake · Discovery · Build · QA · Deploy · Post-launch**) under phase subheadings on a **navy background bar with white text**; collapsible with caret; unphased falls to "Unphased" at the end. [from changelog: "Phase headers on navy"; "Tasks grouped by phase"]
  - **Task composer** at the bottom in a **gray-boxed panel**, tabbed with an "Add task" / "Add bundle" segmented control on a white surface; an "+ Add task" link at the top of the list focuses the composer. [from changelog: "Composer in a gray box"; "Task composer: field picker (not builder)"]
  - **Task bundle templates** — Extraction / review build · Drafting assistant · Meeting-driven engagement. [from changelog: "Task bundles, gates in-list, completed dates"]
  - **Per-task typed structured fields** (URL / Text / Number / Date / Select / Checkbox) via a "Capture a field" picker drawing from the workspace field library (managed in S30). **Field-as-column rollup:** a task-level URL field surfaces as a column on S2 (Repo URL). [from changelog: "Structured per-task fields"; "Field types, composer field-builder, field-as-column"]
  - **Per-task Notes & decisions** expandable field. **Task ordering:** created order first, completed tasks sink; completed tasks show a date next to their status. [from changelog: "'Details' → 'Intake'; per-task notes"; "Task bundles, gates in-list, completed dates"]
  - **Gates rendered inline within their target phase group**; when resolved, collapse to a "Resolved" chip. **Pending gate slot:** role/team + "N eligible" count + "Select your name…" dropdown → Approve / Reject appear once a name is chosen. [from changelog: "Gates identify teams, not individuals"]
  - **Rejection:** requires a comment (Reject enabled only once name + comment present). A rejected slot keeps a rejection record and surfaces a **fresh re-review row**; the gate stays "Changes requested" (pale-orange chip) until an approval, and stays in Home's "Needs your decision" queue. A **Re-request approval** button returns the slot to pending. [from changelog: "Gate rejection requires comment + re-review row"]
- **Side panel** (right rail):
  - **Relationships** — the record's `related` / `duplicate-of` / `re-pursuit-of` links with a "Link a record" action. [from changelog: "Renamed 'Typed links' → 'Relationships'"]
  - (Attachments and Watchers, formerly side-panel sections, are now **tabs** — Attachments via the generic related-records panel, Watchers via "Watchers & alerts".)

### Fields, objects & relationships schema (S30 / S34)
- Every object carries five **system-provisioned fields** (Record ID · Name · Date created · Last updated · Created by), read-only and uncreatable. [from changelog: "Fields: system-provisioned fields"]
- **Field types** include a **Link to record** type (target object · single vs. multiple · optional reverse-link label) — the one-way counterpart to object-level relationships. [from changelog: "Link to record field type"]
- **Object-level Relationships** (name · From/To · cardinality one-to-one / one-to-many / many-to-many · both side labels) power both directions from one definition, **auto-provision managed "Link to record" fields** on the owning side(s) (kept in sync, shown read-only under a Relationships section on the Fields tab), and can be **surfaced as a Request-detail tab** via a toggle + tab label. [from changelog: "Relationships surface + auto-provisioned fields"; "Config-driven detail tabs"]
- **Object scope:** Request and Task are **Global**; Feature and Toolkit item are **Local Workspace** — so the Platform → Fields & objects → Objects tab lists only Request and Task. [from changelog: "Object scope: global vs workspace"]
- **Visible-on-stages** appears only for lifecycle-bound objects (Request, Task). Archive retires a field (reversible); Delete removes the definition. [from changelog: "Fields: stage visibility scoped to lifecycle objects"; "retire (archive) a field"]

### Dashboards (S6 multi-dashboard)
- Dashboards are multiple and user-created: a title-dropdown **switcher** (Shared / Personal) + **New dashboard** (name + visibility side sheet). The seeded AI-default keeps its bespoke layout; custom dashboards are config-driven with an **Edit layout** mode (reorder / edit / remove widgets) and an **Add widget** composer — widget type (KPI / breakdown bars / pipeline segments / records table) · metric or group-by dimension · row limit · half/full width · department + stage scope. Widgets compute live from request data. [from changelog: "Dashboards: full composer"]

### Approver teams & lifecycles (S31 / S29)
- Team-only approver slots identify a role label + "N eligible" count; team **membership is managed in Users & access → Approver teams** (name + email member rows, inline-editable team names, "N gate slots filled"), keyed off the shared roster so changes apply across all lifecycles. S31's approver-teams section is a **read-only reference** with a **Manage teams** button to Users & access. [from changelog: "Approver teams moved to Users & access"]
- **Multiple lifecycles**: the lifecycle editor selects a lifecycle from a **dropdown** (any number stay compact); the **lifecycle name** is the single label used everywhere (the separate "Request type" was dropped; the intake picker is relabeled "Lifecycle"). [from changelog: "Lifecycles: dropdown selector"; "dropped the separate request type"]

### Bridge provenance on escalated records (S5)
The three-part bridge visualization from the original blueprint **is not built**. Its meaning is preserved through the **"Escalated · [origin]" status pill**, a **slim mirror note** atop the Intake tab, and the **pale-gold "⇄ Crossed · locked on PG" marker** on each crossing field (editable AI-side; lock is conceptual, PG-side only). [from changelog: "Replaced the collapsible escalation-bridge panel with an Intake tab on Request detail"]

### Aging tint semantics
Pale-gold — due soon · pale-orange — overdue · plain — on track / no due date. Text suffix on the due cell repeats the state (WCAG 2.2 AA § 1.4.1).

### Theme
Light + dark on every screen; theme toggle is a real product control in the top bar, persisted per user.

### Responsive
Every screen works 320px → 1920px+; sidebar collapses to drawer below 1024px; card content wraps or scrolls horizontally as needed (never overflows). Settings body wraps the 236px secondary nav above the content column when tight.

### Motion
Purposeful, calm — no bounce, spring, or overshoot. Functional motion uses the motion tokens; decorative motion is gated on `prefers-reduced-motion: no-preference`.

### Copy
Verb + noun buttons. Sentence-case headlines. No exclamation marks in errors. What-happened + why + how-to-fix formula (`ux-copy-and-microcopy.md`). Optional-marker convention (mark optional, not required — no `*`).

### Icons
Phosphor regular only; sizes 16 / 20 / 24 / 32 / 48. No filled variants.

---

## Save for /build screen details

*Role/access matrix followed by per-screen blocks for the screens the prototype still defers. Screens promoted to Prototype during reconciliation (S9, S10, S11, S23, S28, S29, S30, S31, S32, S33, S34, S35, S36, S38, S39, S43, plus the original S1–S6) are no longer in this section — see their master-table rows and the Cross-cutting notes above.*

### Role/access matrix

| Screen | Viewer | Member | Workspace admin | Platform admin | Dashboard-viewer |
|---|---|---|---|---|---|
| S1 Home | ✓ | ✓ | ✓ | ✓ | — |
| S2 Requests list | R | ✓ | ✓ | ✓ | — |
| S3 Intake form | — | ✓ | ✓ | ✓ | — |
| S4 Record detail | R | ✓ | ✓ | ✓ | — |
| S5 Escalated record | R | ✓ | ✓ | ✓ | — |
| S6 Dashboards | R | R | ✓ | ✓ | R (if bound) |
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
| S22 Announcements read-list | R | R | R | R | — |
| S23 Announcements (admin) | — | — | ✓ | ✓ | — |
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
| S34 Platform Fields & objects | — | — | — | ✓ | — |
| S35 Crossing map | — | — | — | ✓ | — |
| S36 Authentication | — | — | — | ✓ | — |
| S37 Role-label catalog | — | — | — | ✓ | — |
| S38 Workspaces | — | — | — | ✓ | — |
| S39 Platform audit | — | — | — | ✓ | — |
| S43 Toolkit | R | ✓ | ✓ | ✓ | — |
| S40 No-access page | ✓ | ✓ | ✓ | ✓ | ✓ |
| S41 Empty list | ✓ | ✓ | ✓ | ✓ | — |
| S42 Filtered to zero | ✓ | ✓ | ✓ | ✓ | — |

Legend: **✓** = full access · **R** = read-only per the entitlement · **—** = not accessible. (Prototyped screens kept in the matrix for completeness — their access rules apply to the rendered surfaces.)

---

### S7 Sign in
- **Purpose.** SSO handshake with Entra ID.
- **Who uses it.** Everyone, once per session.
- **Content.** McDermott lockup centered; "Sign in with SSO" primary button; policy footer.
- **Business rules.** No local auth path. Sign-out returns here. On success, land on the user's last-used workspace's Home (or default workspace if none).
- **Connects to.** S1 (SSO success).

### S8 Workspace switcher (deferred beyond the prototype stub)
- **Purpose.** Full workspace-picker surface with recent workspaces, favorites, and a search across the user's memberships.
- **Who uses it.** Anyone in >1 workspace.
- **Content in the prototype.** A stub bordered control in the sidebar under the lockup, opening a "Your workspaces" popover with the hub + example PG workspaces (Litigation, M&A). Switching itself is stubbed.
- **Content to build.** The above, plus real switching (redraws the rail per §21.4 of the build spec), search across memberships, favorites/pin, recent workspaces, role badge per entry.
- **Business rules.** Access resolves to the user's entitlements — a workspace they're not in never appears. Switching redraws the rail.
- **Connects to.** S1 (Switch).

### S12 Feature dashboard
- **Purpose.** The firm-wide read-only browse-and-find surface for reuse.
- **Who uses it.** Firm-wide, via Dashboard-viewer binding.
- **Content.** KPI tile (Published features) · bar breakdown by Feature type · bar breakdown by Tech/stack · records grid (Published-only default). Follows the items-grid pattern; buildable via S6's dashboard composer.
- **Business rules.** Draft and Deprecated filtered out. Access-respecting.
- **Connects to.** S9 (Browse catalog).

### S13 Add to catalog
- **Purpose.** Harvest a reusable feature from a shipped Request.
- **Who uses it.** AI Analysts, from a shipped Request's detail or Build surface.
- **Content.** Draft form prefilled from the source Request (Name, Tech/Stack, Solution Pattern, repo URL); user fills one-liner and how-to-reuse notes; attach screenshots. *The generic New/Edit feature editor is rendered in S9; the prefill-from-Request flow stays deferred.*
- **Business rules.** On submit, mints a Feature record and stamps a `sourced-from` typed link back to the source Request. Uses the Draft mechanism (§9.7).
- **Connects to.** S9 (Save feature).

### S14 Workload dashboard
- **Purpose.** Manager and analyst view of who's loaded with what.
- **Who uses it.** AI Solutions Manager + Analysts.
- **Content.** Open records per analyst (bar) · Unassigned KPI · Pending sign-off KPI · Median time-to-first-triage (KPI-with-trend, rolling 30/90-day) · Aging in stage (histogram) · records grid with Export view. Match S6's dashboard chrome; buildable as a saved dashboard via S6's composer.
- **Business rules.** Hub-scoped (escalated + AI-direct only). Uses date-difference primitive for the histogram (R1 Phase 2 dependency).
- **Connects to.** S2 (Drill to list).

### S15 PG starter dash
- **Purpose.** Default dashboard cloned into every PG/Dept workspace.
- **Who uses it.** PG admin and members.
- **Content.** Requests by Dept/PG/Client (bar breakdown) · Escalation status KPI · records grid.
- **Business rules.** Stage-agnostic by design — the PG template seeds no stages. Workspace-local; admin extends after defining lifecycle.
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
- **Content.** List with name, audience badge, last-updated. *Partly realized by S6's Shared/Personal switcher dropdown; the full directory page stays deferred.*
- **Business rules.** A dashboard appears only if the viewer is in its audience (§10.2 two-layer model).
- **Connects to.** S6 (Open default) · S14 · S12.

### S18 Escalate modal
- **Purpose.** Confirm-and-lock at the moment of escalation.
- **Who uses it.** PG member/admin escalating a Request to the AI Solutions workspace.
- **Content.** Summary of what will lock (crossing fields), prompt to commit any pending edits, primary "Escalate" and secondary "Cancel".
- **Business rules.** Missing required crossing field blocks escalation. On confirm: snapshot fields, adopt ID on the AI-side record at stage Intake, lock PG-side crossing fields, open the status mirror, notify AI Intake group. **One-time, one-way** (§6.6). Uses the modal pattern from `disclosure-surfaces.md`.
- **Connects to.** S5 (Confirm escalation).

### S19 Copy modal
- **Purpose.** Copy a record into a fresh draft.
- **Who uses it.** Any member/admin.
- **Content.** "Include attachments" toggle (default off), "Link back to source" radio (`related` / `re-pursuit-of` / none), Cancel/Continue.
- **Business rules.** New draft has fresh ID, no outcome, no history. Cross-workspace copy respects the crossing map for PG↔AI (§5).
- **Connects to.** S3 (Prefilled draft).

### S20 Bell centre
- **Purpose.** In-app notification centre — the day-one channel.
- **Who uses it.** Everyone.
- **Content.** Popover from the top-bar bell — mixed list of per-record notifications and Announcements, most recent first, mark-all-read. **The prototype's bell menu ships stubs for Notifications and Announcement history**; the full centre is deferred here.
- **Business rules.** Notifications per §11.2. Announcements per their audience.
- **Connects to.** S4 (Open record) · S21 (Open announcement).

### S21 Announcement detail
- **Purpose.** Read a specific announcement.
- **Who uses it.** Anyone in the announcement's audience.
- **Content.** Title, body (rich text), author, published date, expiry. *Read-facing; authoring lives in S23 Announcements (prototyped).*
- **Business rules.** Read-only for consumers; author + admins can edit until Retired/Archived. Auto-archives per the announcement's auto-archive setting.
- **Connects to.** S22 (Back to list).

### S22 Announcements read-list
- **Purpose.** Browsable reader-facing history of announcements (distinct from the S23 admin authoring surface).
- **Who uses it.** Everyone.
- **Content.** List with title, snippet, published date; pinned first, then most-recent.
- **Business rules.** Audience-scoped.
- **Connects to.** S21 (Open announcement).

### S24 Saved-view editor
- **Purpose.** Author or edit a saved view.
- **Who uses it.** Any member (personal views) or admin (shared views).
- **Content.** Side sheet, tabbed: **Filters** (row-based *field + comparator + value* builder) · **Fields** (two-pane shuttle for column set + order) · **Sort** (reorderable rows). Footer: scope toggle (personal / shared), default toggle, Cancel/Save. **The prototype's saved-view picker surfaces Modify columns / Edit this view / Save as new view stubs — those open S24.** *S32 Views & dashboards (prototyped) manages the resulting views as a read-only reference with admin actions.*
- **Business rules.** Presentation-only — never widens access. A shared view assigned to a Dashboard-viewer is that viewer's field-level boundary (§22.4).
- **Connects to.** S2 (Apply view).

### S25 Task detail
- **Purpose.** Detail surface for a child Task where there's real work.
- **Who uses it.** Member/admin working on a Task.
- **Content.** Task fields (title, assignee, status, optional precondition, structured typed field per S30's field library, Notes & decisions), thread, metadata. Precondition shown if locked. No stage stepper.
- **Business rules.** Task status: Locked → Open → Done (or Cancelled). Precondition is a condition-engine rule. Closes by completion; never hard-deleted (§2.4).
- **Connects to.** S4 (Open parent).

### S26 Drafts
- **Purpose.** Personal management surface for pre-record drafts.
- **Who uses it.** Every user, for their own drafts.
- **Content.** List of the user's saved drafts with name, last-edited timestamp, resume, discard.
- **Business rules.** Drafts are pre-record — no canonical ID, no audit until submitted. Owner may discard freely (the sole exception to the no-hard-delete floor).
- **Connects to.** S3 (Resume draft).

### S27 Search results
- **Purpose.** Global search results across the current workspace — across fields, comments, and attachment filenames.
- **Who uses it.** Everyone, from an entry-point beyond the top-bar workspace search.
- **Content.** Results list — record hits, comment hits, attachment-filename hits. **Distinct from the top-bar workspace search** (records-only, max 6 results) that the prototype ships.
- **Business rules.** Access-respecting (§9.5). No OCR. Legacy ID searchable.
- **Connects to.** S4 (Open record).

### S37 Role-label catalog (superseded — pending confirmation)
- **Purpose.** Managed catalog of gate role labels (AI Solutions Manager · GCO · InfoSec · PG/Dept Lead · Data Privacy · extensible).
- **Status.** **The v2 prototype manages gate role labels through Users & access → Approver teams (workspace-owned); the workspace role catalog was explicitly removed** [from changelog: "Roles removed"]. A separate platform Role-label catalog is not rendered and appears absorbed — carried forward pending confirmation (open question 4). Absence from the prototype alone does not delete it.
- **Content (if retained).** Label list, add / rename / retire; renames forward-only (past sign-offs keep the label they were captured under, §7.2).
- **Connects to.** (platform).

### S40 No-access page
- **Purpose.** Read-blocked response.
- **Content.** Simple pale-background surface with "You don't have access to this record. Ask your workspace admin." + "Go to Home" CTA.
- **Business rules.** **Never** reveals existence — no "record not found" copy, no ID, no title (§22.6).
- **Connects to.** S1 (Go home).

### S41 Empty list
- **Purpose.** Zero-data empty state (workspace has no records of this type yet).
- **Content.** Pale-background surface with illustration, "No requests yet" title, one-line context, primary "Create your first request" CTA (opens S3).
- **Business rules.** Distinct from filtered-to-zero (S42).
- **Connects to.** S3 (Create first).

### S42 Filtered to zero
- **Purpose.** Records exist but current filters exclude all of them.
- **Content.** Inline within the list — bordered card with `--bg-surface` background, subtle "No matches for these filters" title, "Clear filters" secondary CTA.
- **Business rules.** Never uses pale fill (reserved for zero-data). Text color follows theme.
- **Connects to.** S2 (Clear filters).

---

## Handoff steps

1. **Blueprint reconciled with prototype (v2).** This document + [`solution-requirements.md`](../product/solution-requirements.md) + [`ai_solutions_tracker_build_spec_final.md`](../dev/ai_solutions_tracker_build_spec_final.md) are the three canonical sources. The prototype at `artifacts/docs/design/project/AI Solutions Tracker.dc.html` is the visual truth for prototyped screens (**S1, S2, S3, S4, S5, S6, S9, S10, S11, S23, S28, S29, S30, S31, S32, S33, S34, S35, S36, S38, S39, S43**).
2. **[`HANDOFF-design-brief.md`](HANDOFF-design-brief.md) is superseded** by the prototype. Do not build from it. It stays as an audit record.
3. **The `design_handoff_admin_settings_shell/` sub-bundle is documentation, not a competing build spec.** Where it disagrees with the focal file, the focal file wins (it is newer — e.g., the sub-bundle lists a Platform Role-labels page the focal file dropped).
4. **Run `/dev-build-architecture` next.** It reads this blueprint + the build spec + the requirements doc + the prototype at `artifacts/docs/design/project/` and produces the architecture artifacts. The **App route / component** column fills in during build.
5. **Where the build spec and the prototype disagree**, the prototype wins for prototyped screens (`.claude/rules/design/README.md`). The build spec still governs save-for-/build screens and behaviors not settled by the prototype.

## Change log

| Date | Changed by | What changed |
|---|---|---|
| 2026-07-03 | `/design-foundation` | Initial blueprint. 6 prototyped screens: S1 Home, S2 Requests list, S3 Intake form, S4 Record detail, S5 Escalated record, S6 AI dashboard. 36 saved for /build. Confirmed at user checkpoint. |
| 2026-07-03 | `/design-code-handoff` | Reconciled with prototype. **Added:** S31 Lifecycle & gates promoted to Prototype. **Changed:** S4 tab structure Fields → Intake; S5 bridge panel → inline crossed-field markers + mirror note + "Escalated · [origin]" pill; meta strip Origin → Submitted; side panel Typed links → Relationships; S6 → 4 uniform tiles + heatmap + grid; team-only approver slots + "Select your name"; rejection requires comment + re-review row + Re-request approval; task list phase-grouped; tabbed task composer; per-task typed fields + field-as-column rollup; per-task Notes & decisions; save indicator on tab row; top-bar quick-create → workspace search; sidebar workspace-switcher stub; user identity → top-bar avatar. Prototype source populated for S1–S6, S31. |
| 2026-07-03 | `/design-code-handoff` (re-run) | Re-ran against the same archive — no drift; silent no-op. |
| 2026-07-16 | `/design-code-handoff` | **Reconciled with prototype v2** (`Design brief handoff-handoff v2.zip`, normalized to `project/`; focal `AI Solutions Tracker.dc.html`, 6944 lines). **Sidebar IA change:** the flat Admin nav became two grouped entries — **Workspace** (`gear`) and **Platform** (`shield-check`, platform-admins only) — each opening a settings surface with a secondary side-nav (cross-cutting "Settings surface"). **Promoted to Prototype (15):** S9 Feature catalog, S10 Feature detail (side sheet), S11 Feature gallery (view toggle), S23 Announcements, S28 Import & export, S29 Users & access, S30 Fields & objects, S32 Views & dashboards, S33 Workspace audit, S34 Platform Fields & objects, S35 Crossing map, S36 Authentication, S38 Workspaces, S39 Platform audit; S31 relocated into Workspace settings. **Added (new):** **S43 Toolkit** (Reference surface); object-level **Relationships** + **Link-to-record** field type (S30); **config-driven detail tabs** + record **Status/hold** model + **Watchers & alerts** tab (S4); **multi-dashboard switcher + widget composer** (S6); **system-provisioned fields**; **multiple lifecycles via dropdown** + approver-teams moved to Users & access (S31/S29); structured **Object + Record ID** audit columns; **Import wizard**; announcement **scheduled publish + auto-archive**. **Renamed:** S6 "AI dashboard" → "Dashboards"; S34 "Field schema" → "Platform Fields & objects"; S36 "Access provisioning" → "Authentication"; S38 "Workspace provisioning" → "Workspaces"; S39 "Firm-wide audit" → "Platform audit"; S22 → "Announcements read-list" (distinct from S23 admin authoring). **Kept as-is (deferred):** S7, S8, S12, S13, S14, S15, S16, S17, S18, S19, S20, S21, S22, S24, S25, S26, S27, S37, S40, S41, S42 — no changelog-cited deletions. **S37 Role-label catalog** flagged superseded-by-Approver-teams (open question 4) but not deleted (non-destructive default). Prototyped count 7 → 22 of 43. Prototype source populated for all prototyped screens (focal file, at the named group → page). |

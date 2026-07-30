# Backlog — Follow-up Items

> Parked items to revisit later. Capturing these so they aren't lost — not a commitment to build, and not being implemented now.

_Last updated: 2026-07-30_

---

## Tasks & Stages

### 1. Task-completion-gated stage advancement
A record can't move to the next stage until every task in the prior stage(s) is completed.

**Open decisions (settle before building):**
- **How the move happens:**
  - _Block manual advance_ — user clicks advance on the stepper; it's blocked (with a clear message) until all prior-stage tasks are done. Nothing moves on its own.
  - _Auto-advance_ — the record jumps to the next stage the instant the last task in a stage is checked off.
  - _Auto-advance + gates_ — auto-advance on task completion, but if the transition has an approval gate, open the gate instead of moving.
- **Empty stage** — what happens when a stage has zero tasks (auto-pass, or nothing to block?).
- **Gates as a prerequisite** — should completed approval gates also count alongside tasks?

### 2. "Status changes dynamically" based on task completion
Likely the same feature as #1 — confirm whether "status" means the **stage stepper** advancing, or the **In progress / On hold status** reacting to task state. (Currently stage and status are separate concepts.)

### 21. Assign tasks to other workspace members
Let a task be **assigned to another person who has access to the workspace**, not just handled
by whoever's on the record — an assignee picker limited to active workspace members.

- **To decide:** where the assignee shows (task row + Tasks & gates), whether the assignee is
  notified, whether it drives any "my tasks" filtering, and how it interacts with task
  completion permissions (can only the assignee check it off, or anyone?).

### 22. Rework the task line — drop "Promote", show assignee / status / due date / notes
On the task line **in the AI Solutions workspace**, remove the **Promote** button. Promote-to-
request is a **PG/dept, request-level** feature — it doesn't belong at the **task** level.

Instead, each task line should display:
- **Assignee** (see [#21](#21-assign-tasks-to-other-workspace-members))
- **Status**
- **Due date** — when one is set
- A small **note/comment icon** that opens the task's notes / comments

- **To decide:** whether "Promote" is hidden only for the AI Solutions workspace vs removed
  from the task level entirely; the per-task **status** value set; and the notes/comments
  storage + surface (popover vs inline) for a task.

### 23. Edit a task — modify everything about it after creation
Add the ability to **update/modify a task** after it's created — its **content/title**,
**assigned user**, **due date**, phase, and any other task attributes — not just check it off.
Pairs with the task-line rework ([#22](#22-rework-the-task-line--drop-promote-show-assignee--status--due-date--notes)).

- **To decide:** the edit surface (inline on the task line vs a task detail sheet), who can
  edit (any workspace member, the assignee, admins), and whether edits are audited.

### 24. Give each task a stable, human-readable identity (request number + task number)
On the backend, identify each task by its **request number plus a unique task number**
(e.g. `AIS-00000012-T003`) so that when all data is exported it's easy to **map and track**
each task back to its request.

- **To decide:** the exact format/scheme (per-request sequential task number vs global), that
  the number is stable and never reused after delete, and surfacing it in the Task CSV export
  columns.

### 5. Show the lifecycle's gates by default when a request is created
When a request is created, the gates defined on its default lifecycle should appear in the
**Tasks & gates** page from the start — as pending/upcoming rows — rather than only becoming
visible when the record crosses the gate's stage transition. Today a gate only surfaces once
the record is moved across the exact from→to transition it's attached to, so a brand-new
request shows no gates even though its lifecycle has them.

- **To decide:** whether up-front gates render as a read-only "upcoming" preview (not yet
  actionable) vs. actionable immediately, and how this interacts with #1 (task-gated
  advancement).

---

## Navigation

### 6. Switching the active workspace lands on that workspace's Requests list
When the user changes the active workspace (top-left switcher), the app should navigate to that
workspace's **Requests list** page by default, rather than staying on whatever page/record was
open (which belongs to the previous workspace).

- **To decide:** whether this applies from every surface, or only when the current route is
  workspace-scoped and would otherwise show stale/foreign data after the switch.

---

## UI Cleanup

### 3. Filter popovers are clipped when opened
When a column filter is opened (e.g. the **NAME** filter on **Users & access → Members**), the filter's input boxes are cut off by the surrounding container's overflow — they render partly hidden behind the table.

- **Fix direction:** filter popovers should render fully visible, escaping the clipping container (portal to `<body>`), consistent with the switcher-popover-portal fix already applied elsewhere in the app.
- **Scope check:** confirm whether this affects every gallery/table filter (Requests, Feature Catalog, etc.) or only the Users & access members table.

### 20. Toolkit "new item" should be its own page, not a side popup
The Toolkit's **new item** action currently opens a side popup/sheet. Make it its **own full
page** (route), consistent with the other new-item / new-request create actions in the app.

- **To decide:** the route (e.g. `/toolkit/new`) and whether it mirrors the new-request page
  layout/steps; retire the side-sheet create path once the page exists.

### 16. Platform announcements — drop "broadcast" wording, keep it "Announcements"
On the platform announcements surface, the user-facing copy uses "broadcast" (e.g. broadcast
label/action). Keep the vocabulary consistent with the rest of the app — call it
**Announcements** everywhere the user sees it.

- **Scope:** UI copy only — the underlying `BroadcastId` fan-out mechanism can keep its
  internal name; this is about labels/buttons/headings the user reads, not the data model.

---

## Fields & Admin

### 4. Add choice-field options inline from the field dropdown
For choice (select/option) fields, give **platform and workspace admins** the ability to add a
new choice directly from the field's dropdown — an "+ Add option" affordance at the point of
use — rather than only through the field-definition editor.

- **Permission gate:** only platform admins and workspace admins see the inline add; regular
  users get the plain dropdown.
- **To decide:** where the new option is scoped (workspace-local vs platform/global choice list),
  and whether inline-added options need any confirmation before they persist to the field
  definition.

### 19. Make the request "Tech / stack" field multiple-choice
The **Tech / stack** field on requests should allow **multiple** selections (multi-select),
not a single value — a request commonly spans more than one technology.

- **To decide:** how multi-values render in the list/table columns and CSV export (e.g.
  comma-joined), and whether existing single-value entries migrate cleanly to the multi-select.

### 7. Reopen a closed record (admin-only status override)
Allow a **closed** record to be turned back to an active status — a status override that reopens
it. Restricted to **workspace admins**; regular users cannot reopen a closed record.

- **To decide:** which active status a reopened record lands on (e.g. back to In progress, or a
  chooser), whether the reopen is audited, and whether it reactivates the prior stage/tasks or
  starts fresh.

---

## Records & Linking

### 8. "Link a record" — record ID as a dropdown of available records
On the **Link a record** action, the record-ID field should be a **dropdown** of available
record IDs rather than a free-text entry. Each option shows the **record ID and the request
name** (e.g. `AIS-00000012 — Deposition summarizer`) so the user can recognize what they're
linking.

- **To decide:** which records populate the list (current workspace only? exclude the record
  itself and already-linked records?), and whether the dropdown is searchable/typeahead for
  large sets.

---

## Watchers

### 9. Add watcher emails for people who aren't workspace users
Allow adding a **watcher by email** even when that email doesn't belong to a workspace user —
so external or not-yet-provisioned people can be watchers, not just existing members.

- **To decide:** how a non-user watcher is stored (free email string vs a lightweight
  contact record), how they receive watcher notifications (email-only, since there's no in-app
  account), and whether any domain/allow-list or admin approval gates who can be added.

### 10. Remove watchers as the request progresses
Give the ability to **remove a watcher** at any point while the request moves through its
lifecycle — so people who no longer need updates can be taken off, not just added at intake.

- **To decide:** who can remove a watcher (any member, the person who added them, admins
  only), whether removal is audited, and whether a removed watcher gets a final "you've been
  removed" notification or none.

---

## Admin Screens

### 26. Admin page to configure the request page — tabs, field layout & order
Add a **workspace-admin** page that makes the **request detail page** configurable, rather than
fixed in code. It should let an admin:
- **Reorder and lay out fields** within a tab (e.g. the Intake tab — control which fields
  appear and in what order/grouping).
- **Add / rename / remove / reorder tabs** (e.g. add a new **"QA bugs"** tab).
- Choose what content each tab surfaces.

Goal: real flexibility over the request page without a code change per adjustment.

- **Big item — likely its own design cycle.** To decide: the config data model (tab list +
  per-tab field/section layout, workspace-scoped vs global), how a **new tab like "QA bugs"**
  gets its own content/fields (ties to the fields catalog + custom objects/records work), how
  built-in tabs (Status, Tasks & gates, Attachments) coexist with admin-defined ones, and
  versioning/migration when the layout changes under existing records.

### 27. Make the create forms configurable too — new request / new feature / new item
Companion to [#26](#26-admin-page-to-configure-the-request-page--tabs-field-layout--order):
extend the same admin configurability to the **create/intake forms** — **New request**,
**New feature**, and **New item** — so admins control which fields appear, their order/grouping,
and which are required, without a code change.

- **Access:** available to **workspace admins and platform admins**.
- **To decide:** whether create-form config is the same data model as the request-page config
  (#26) or a separate "form layout" per object type; how platform-admin (global) config vs
  workspace-admin (local) config layer; and how required-field rules here interact with
  validation.

### 11. Workspace-admin screen to manage task bundles / templates
Add a **workspace admin** screen to create, edit, rename, and delete the **task bundles**
(templates) that the Tasks & gates composer's "Add bundle" applies. Today bundles can be
applied to a record but there's no surface to manage the bundle library itself.

- **To decide:** what a bundle definition holds (ordered task titles, phases, due-date offsets,
  typed fields), whether bundles are workspace-local or can be platform/global, and whether
  editing a bundle affects records that already applied it (it should not — applied tasks are
  copies).

---

## AI Assist

### 13. Show the AI-assist "Ask" star next to the workspace search box, on by default
Surface the AI-assist **Ask** entry point (star icon) **by default** next to the
"Search this workspace" box at the **top-right of every page**, and have it **on by default**
rather than something a workspace has to opt into.

- **Note / open decision:** this reverses the current model, where AI assist is a
  **default-off, per-workspace opt-in** (`AiAssistEnabled`). Turning it on by default is a
  policy change — confirm that's intended given the content-field allowlist / data-handling
  guardrails, and whether platform admins still need a global kill-switch.
- **To decide:** exact placement/spacing beside the search box in the app header, and whether
  the star opens the Ask surface inline (popover) or routes to the Ask page.

---

## Platform

### 14. Add platform users directly, without them first existing in a workspace ("platform first")
Let a **platform admin** add users at the **platform level** — by name/email — without requiring
that person to already exist in (or be added to) a workspace. Provision the person at the
platform tier first; they can then be granted into workspaces afterward.

- **Why:** today a user effectively comes into being via workspace membership (and first-auth
  provisioning). This flips it so platform admins can seed people up front, independent of any
  workspace.
- **To decide:** how a platform-first user is stored before any workspace grant, whether the
  entry is by email (directory lookup) vs a free name, and how this reconciles with the
  first-sign-in auto-provisioning so the same person doesn't get duplicated on first login.

### 15. Platform crossing map — make workspace name selectable, and clarify field sources
On the platform **crossing map**, allow selecting by **workspace name** in addition to the
existing **PG / dept** field and **AI solutions** field.

- **Also:** it's not readily apparent where the PG/dept and AI-solutions field values come
  from — clarify/label their source on the screen (which catalog/field feeds each), so the
  map's inputs are self-explanatory.
- **To decide:** whether workspace is a third independent selector or a filter that scopes the
  other two, and the source-of-truth for each field's option list.

---

## Record Detail

### 17. Put the escalation note inline in the metadata row (don't take a row below)
The "Escalated from Litigation" (or similar) note should sit in the **same row** as the record
metadata — display status, assigned analyst, priority score, etc. — rather than getting its own
block below. Goal: stop losing vertical real estate under the header to that one message.

- **To decide:** how it fits alongside the other metadata (chip/badge vs inline text), and
  behavior when the note is long or absent (row shouldn't jump).

### 18. Keep the edit-fields controls in view as you scroll a long record
Make the edit affordance (Edit / Save / Cancel — the field-editing controls) **follow the page
as it scrolls** so that near the bottom of a long record you can fix a field without scrolling
back to the top. E.g. a sticky/floating action bar.

- **To decide:** sticky header controls vs a floating action button vs a sticky footer bar;
  and that it only shows when the section is actually editable (and stays out of the way of
  content on small screens).

---

## Attachments

### 25. Rename attachments and give uploaded documents some structure (folders)
For attachments, let the user **rename a file** and organize uploads into some **structure**
(rename/create folders, move files between them) rather than a flat list.

- **Context:** today Tier 1 attachments are stored flat (opaque GUID key, no folder tree); the
  display name comes from the SQL row, so a **rename** is a metadata change on that row, not a
  blob move. A folder structure is net-new (the document-pipeline has a folder tree, but that's
  the heavier Tier 1+ pipeline — decide whether to bring a light version here).
- **To decide:** rename = edit the stored `FileName` only; whether folders are real records
  (like the pipeline's SQL folder tree) or just a display grouping; and per-folder filename
  uniqueness.

---

## Cleanup (other)

### 12. Remove the duplicative "Approver teams" section (§3) from the Lifecycle page
The Lifecycle editor's third section (`ApproverTeamsEditor`, "3 · Approver teams") only
add/removes team members against the **same** roster already managed under
**Users & Access → Approver teams** — same data, same workspace-admin backend. It's a
redundant duplicate. **Decision: remove it.** The Lifecycle page keeps Stages + Gates
(define the flow and assign a team to each gate transition); staffing the teams lives solely
under Users & Access as the single source of truth.

- **Considered alternatives (not chosen):** make §3 read-only with a "Manage teams" link to
  Users & Access; or leave as-is for in-context convenience.
- **On removal:** the numbered sections become Stages (1) + Gates (2); check nothing else
  depends on §3's add/remove-member handlers being reachable from this page.

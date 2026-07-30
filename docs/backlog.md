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

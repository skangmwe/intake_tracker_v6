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

## Cleanup (other)

_(items to add)_

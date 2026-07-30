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

---

## UI Cleanup

### 3. Filter popovers are clipped when opened
When a column filter is opened (e.g. the **NAME** filter on **Users & access → Members**), the filter's input boxes are cut off by the surrounding container's overflow — they render partly hidden behind the table.

- **Fix direction:** filter popovers should render fully visible, escaping the clipping container (portal to `<body>`), consistent with the switcher-popover-portal fix already applied elsewhere in the app.
- **Scope check:** confirm whether this affects every gallery/table filter (Requests, Feature Catalog, etc.) or only the Users & access members table.

---

## Cleanup (other)

_(items to add)_

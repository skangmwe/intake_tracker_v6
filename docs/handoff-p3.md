# Developer Handoff — Intake Tracker (Part 3 / P3)

> The **third** work package — the two larger, design-heavy clusters re-bucketed out of P2:
> **H (configurable request UI)** and **L (lists, planning & effort)**. Both need their own
> runway; neither is a quick win. P1 (clusters A, B, D, E) is `handoff.md`; P2 (clusters C, F, G,
> J, K, M) is `handoff-p2.md`. Item numbers (e.g. **#26**) map to [`backlog.md`](backlog.md).
>
> _Prepared: 2026-07-30 (split out of the P2 handoff on re-prioritization)._

---

## 0. Read me first

Repo conventions, build workflow, migration-numbering rule, and the permission model are identical
to the P2 handoff — see **`handoff-p2.md` → section 0**. Everything there applies here.

**Two domain facts these clusters lean on:**
- **One field/object metadata engine:** `ObjectType` + custom objects, driven by `FieldSchemaService`
  (API) + `usp_UpsertFieldDefinition` + `shared/fields/fieldForm.ts` (web). **Central to Cluster H.**
- **Stage is derived from task/gate state** (the P1 **Cluster E** model) — relevant to L1's timeline
  grouping if it keys off stage.

**Sequencing:** L (roadmap/bulk/effort) is buildable independently and can go first. H is a design
cycle — do the design session before any build. Both warm up on the same field engine that P2's
**K1** touches, so landing P2 first de-risks H.

---

## Cluster H · Configurable request UI — #26, #27 — 🚧 DIRECTION SET (3 core calls locked; schema + versioning for the design session)
**Effort: XL.** The three biggest calls are pre-decided (below); the remaining design work is the config schema/tables, versioning, and the create-form editor.

**Concept:** an admin-edited **layout config** that the request **detail page** (tabs + fields) and the **create forms** read from, instead of hard-coded layout. _Note: this is also what resolves the pilot's "analysts shouldn't fill intake fields" complaint (the create-form half, #27) — that fix waits on this cluster._

**First-cut data model:**
- **Tabs** (per `WorkspaceId` × `ObjectType`): `key`, `label`, `order`, `isBuiltIn`, `kind`. Built-in tabs (Status, Tasks & gates, Attachments, Watchers, Activity, Relationships) can be **reordered / renamed / hidden — not deleted**; admin tabs (e.g. "QA bugs") are **custom**.
- **Tab content:** an ordered set of field references (from the field catalog for that object type), grouped into sections, with per-surface flags.
- **Create-form layout (#27):** a separate, simpler ordered field list + required flags per object type (create forms have no tabs), reusing the same field catalog.

**Decisions (locked — pre-decided, no longer open):**
- **Custom-tab content — field-group first:** v1, a custom tab hosts a **group of extra Request fields**. An **embedded list of a linked custom object** (e.g. QA Bug records) is a **later** phase (ties into the custom-objects/records engine — `web/src/features/objects/*`, `custom-records/*`).
- **Built-in-tab hiding — all hide-able:** every built-in tab can be reordered, renamed, and **hidden** (none deletable). **No protected tabs** — admin's discretion.
- **Scope — workspace-only + shared baseline:** each **workspace owns its own layout** (workspace admin edits it); **no platform-editable global override** at runtime. The app ships a **built-in default layout** (the *baseline*) that **seeds each workspace on first use**; the workspace then edits its own copy independently, and baseline changes do **not** retro-propagate to existing workspaces.

**Still for the design session:**
- **Versioning/migration (proposed — confirm):** records render against the **current** layout (no per-record snapshot). Removing a field **hides** it, never deletes stored data; a changed required-rule applies to **new edits**, not retroactively.
- The exact **config schema/tables**, and the **create-form layout (#27)** field-list editor.

**Entry points:** `web/src/features/requests/components/RecordDetailPage.tsx` + `IntakeFormPage.tsx`; field engine (`api/Api/Modules/Fields/*`, `shared/fields/fieldForm.ts`); custom objects (`web/src/features/objects/*`, `custom-records/*`); **new config tables + procs** (migration coordinated). Warm-up: clusters **B (P1)** + **G (P2)** + **K1 (P2)** touch the same field engine.

---

## Cluster L · Lists, planning & effort — from analyst pilot feedback (2026-07-20)
**Effort: L (roadmap is the biggest).** Triaged against the current code; file/proc pointers are starting points.

### L1 — "Initiative Roadmap": workspace pipeline gantt (1–3 years) — 🆕 **Effort: XL**
Analysts want to map the **1–3 year pipeline** — what's in flight now and what's teed up next — per the pilot's *"one of the key features my tracking tool solves."* **The requester supplied a prototype ("Initiative Roadmap") — build to it.** This is a full quarterly swimlaned gantt, **not** a lightweight timeline; scope accordingly.

**Placement & scope (decided):** a **per-workspace** roadmap **housed under Dashboards** (`web/src/features/dashboards/*` — as a dashboard/widget), scoped to the **active workspace**. **No** firm-wide/cross-workspace view. The existing `TimelineView`/`AgendaView` (`web/src/shared/components/RecordViews/`) may back the rendering but almost certainly needs extending to a spanning-bar gantt.

**Layout (from the prototype):**
- **Time axis:** **quarterly** columns across **~3 years**, year + quarter headers (e.g. 2026 Q1 → 2028 Q4), with a **"TODAY"** vertical marker line.
- **Swimlanes = a value-stream "lane" field** (prototype: **C2C** Contract to Cash · **I2P** Invoice to Pay · **P2R** Plan to Report), each lane showing **code, name, and project count**. This is the **"lanes / group driving the initiative"** custom field from **feedback #2** — group by that categorical field, **not** by analyst.
- **Items = bars spanning a date range**, colored by **status**: **Backlog** (gold), **Active** (blue), **Completed** (grey). **Milestone markers** (open / completed circles) sit on bars.
- **Filter bar:** **Lane** (All lanes) · **Status** (default **"In-flight + scheduled"**) · **Milestones** (show/hide) · **Horizon** (**Standard / +1yr / +2yr**) · **Prior 2 quarters** (No/Yes).
- **Legend:** Backlog · Active · Completed · open milestone · completed milestone · Today.

**Data model — decided (all per-workspace configurable, one consistent widget-config pattern):**
- **Bar span:** the widget config picks which date field is the bar **start** and which is the **end**; records with a single date render as a short bar / point. Handles cross-workspace schema variance.
- **Lane field:** the config picks the **categorical field** that supplies the swimlanes — the workspace's **"lane / value stream" select** (feedback #2: C2C / I2P / P2R). Records with no lane fall into an **"Unassigned"** lane.
- **Milestones:** the config picks one or more **date field(s)** rendered as markers on the bar; a marker reads **completed** if that date is reached / in the past, **open** otherwise.

**⚠️ Audited — reuse existing scaffolding, don't invent:**
- A **`line-timeseries` `WidgetType`** already exists (declared + a `TimeSeriesData` shape; renderer returns `null` — `WidgetRenderer.tsx`) — reconcile the roadmap widget with it rather than minting a new key. Adding a widget type touches ~4 coordinated spots (the `WidgetType` union, `widgetTypeCatalog.ts`, `WidgetRenderer.tsx`, a metric resolver).
- **Two dashboard systems — pick a lane:** fixed-metric (`DashboardMetricResolver.cs`) vs composed (`widgetTypeCatalog.ts` + `usp_GetDashboardComposed*`).
- **`TimelineView`/`AgendaView`** exist and are already wired into `ViewModeToggle`, just enabled on no surface — reuse their rendering for the widget body.
- **Lane field is net-new** — no lane / value-stream / workstream concept exists in code, schema, or types; it's the feedback #2 custom field (or bind swimlanes to an existing categorical: origin / stage / analyst).

**Confirm in the build/design pass (sensible defaults proposed):**
- **Status → colour:** **Backlog** = not-yet-started · **Active** = in progress · **Completed** = closed/delivered (map from the record's status / derived state).
- **Defaults:** Status filter **"In-flight + scheduled"** · **Prior 2 quarters** off · **Horizon** "Standard" = a rolling window around Today (extend via +1yr / +2yr).

### L2 — Bulk actions on the Requests list — 🆕
No row selection, no bulk toolbar, no batch endpoint today (`RequestsListPage.tsx`, `shared/components/Table/TableShell.tsx`). **Audited — build-from-scratch:** `TableShell` has **zero** latent selection (no checkbox column, no `selectedIds`/`onSelectionChange` props) — build the selection column + props + a11y, and each consumer opts in. **Decided:** add multi-select + a bulk-actions bar for **reassign / stage / status / priority**. Needs a row-select API on the shared table + a batch proc/endpoint. Pairs with **P2's J3** (inline priority).

### L3 — Record measured (actual) level of effort — 🆕 small
Only the 1-5 intake `levelOfEffort` **estimate** exists (feeds the priority score); nothing records what the build actually took. **Decided:** capture an **actual/measured** level of effort at/after closure, stored separately from the estimate, to enable estimate-vs-actual calibration. **Enhancement:** a good AI-assist spot — a quick Claude follow-up could suggest the effort value for the analyst to confirm (ties into the AI-assist field-suggestions work).

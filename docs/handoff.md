# Developer Handoff — Intake Tracker Enhancements

> Companion to [`backlog.md`](backlog.md). That file is the raw idea log; **this** file is the
> prioritized, clustered work plan for the developer picking up the code changes. Item numbers
> (e.g. **#22**) map back to `backlog.md`.
>
> _Prepared: 2026-07-30._

---

## 0. Read me first — how to work in this repo

### Stack & layout (monorepo)
| Area | Path | Stack |
|---|---|---|
| Frontend | `web/` | React 19 + TypeScript 5, webpack 5, Node 24. Feature-folder structure under `web/src/features/*`; shared UI in `web/src/shared/*`. |
| API | `api/` | ASP.NET Core (net10.0), EF Core for single-table CRUD, **stored procedures for everything else**. |
| Database | `database/` | Azure SQL. Migrations in `database/migrations/`, procs in `database/procedures/<group>/`. |
| Shared types | `shared/types/*.ts` | The wire contract shared by web + api. Change types here first. |

### Build workflow
The project runs a **northstar pipeline** — do **not** free-build:

1. **`/plan`** — reads the requirements + this doc, produces a slice plan.
2. **`/build`** — implements one slice at a time.
3. **`/dev-review-and-remediate`** — the slice-completion gate (unit tests + code review + security review + design-fidelity).
4. **`/ship`** — commits + merges into `dev` (the integration branch) and pushes. **Direct `git commit` is blocked** — `/ship` is the only path to a commit. Branches/worktrees are automatic; the developer never types git.

If the developer is **not** using this Claude harness, they still follow the same gates manually
(`npm run lint`, `npm run test:coverage`, `dotnet test`, tSQLt) and the rule files below.

### Global rules the developer MUST follow (read before touching a layer)
- **Before planning any feature:** `.claude/rules/dev/_core-requirements.md` (mandatory rule-reading step + pre-implementation checklist).
- **Web:** `web-component-architecture.md`, `web-coding-standards.md`, `web-styling.md`, `web-testing.md`.
  - **Design tokens only** — no raw hex/px; every design-system component sets a stable **`data-ds="<type>"`** (the design-fidelity gate depends on it). Design system: `.claude/rules/design/_core-requirements.md` + companions.
- **API:** `api-coding-standards.md`, `api-record-access.md` (**ownership violations return `403`, never `404`**), `api-error-handling.md` (ProblemDetails), `api-validation.md`.
- **Database:** `database-coding-standards.md` (PK + 6 audit columns + soft-delete on every table), `database-migrations.md` (idempotent `IF NOT EXISTS` + a rollback script), `database-stored-procedures.md`.
- **Migrations numbering:** highest existing is `103`. **The next new migration is `104`**, then increment. Format `YYYYMMDD_NNN_Description.sql` + a `_Rollback.sql`.
- **Tests ship in the same slice** — never deferred. Web: jest + jest-axe (assert axe on each meaningful state). DB: tSQLt. API: xUnit (happy / permanent-failure / cancellation).

### Confirmed permission model (reference — several items gate on this)
`AccessLevel = 'Viewer' | 'Member' | 'WorkspaceAdmin'` ([`shared/types/common.ts`](../shared/types/common.ts)), an **ordered, additive** hierarchy. Platform admin is a **separate additive firm-wide grant**, not a level.

| Level | Reads | Edits records | Admin surfaces |
|---|---|---|---|
| Viewer | ✅ whole workspace (read-only) | ✗ | ✗ |
| Member | ✅ | ✅ | ✗ |
| WorkspaceAdmin | ✅ | ✅ | ✅ |

- Server gate helper: `AccessGuard.HasWorkspaceLevelAsync(userId, workspaceId, WorkspaceLevel.X)` (means "at least X").
- Write procs gate on `Level IN ('Member','WorkspaceAdmin')`; admin procs on `Level = 'WorkspaceAdmin'`.
- "Dashboard only" viewer = the `isDashboardViewer` + `boundDashboardId` flags on the membership (see cluster G / #28).

### Two domain facts that trip people up
- **Gates are transition interceptors, not rows that exist up front.** An approval gate only *opens* when a record is moved across its exact `from→to` stage transition (`useSetStage` → `POST /v1/requests/{id}/stage`). Relevant to cluster **E** (#5 wants them shown up front).
- **Tier-1 attachments are stored flat** (opaque GUID blob key, no folder tree; display name is a SQL column). Relevant to #25.
- **Fields/objects run on one metadata engine.** `ObjectType = 'Request' | 'Task' | 'Feature' | 'Toolkit' | 'Announcement'` plus custom objects. Field definitions flow through `FieldSchemaService` (API) + `usp_UpsertFieldDefinition` + `shared/fields/fieldForm.ts` (web). Relevant to clusters **B** and **H**.

---

## Priority tiers

**P1 (build first, in this order): A → B → D → E.**
**P2 (after P1 — suggested order, adjust freely): C, F, G, then H (own design cycle), and I needs a product decision.**

---

# P1

## Cluster A · Quick UI wins — items 16, 12, 3, 17, 18, 6, 20
**Effort: S each, mostly independent. Good first slices to build momentum.**

| # | What | Frontend entry point | Backend | Notes |
|---|---|---|---|---|
| 16 | "Broadcast" → "Announcements" copy on the platform announcements surface | `web/src/features/announcements/*`, `web/src/features/platform-admin/*` (announcements views) | none | **Copy only.** Keep the internal `BroadcastId` mechanism; change user-visible labels/headings/buttons. |
| 12 | Remove the duplicative Approver-teams §3 from the Lifecycle page | `web/src/features/lifecycle/components/ApproverTeamsEditor.tsx` (delete) + `LifecycleEditor.tsx` (drop the render + props `teams`/`onAddMember`/`onRemoveMember`), `LifecyclePage.tsx` | none | Membership mgmt already lives under Users & Access. Lifecycle keeps Stages (1) + Gates (2). Remove now-orphaned handlers. |
| 3 | Filter popover clipped behind the table | `web/src/shared/components/Table/FilterFunnel.tsx` (portal the popover to `<body>`) | none | Reuse the switcher-popover-portal pattern already in the app. Fixes it everywhere `FilterFunnel` is used (confirm Users & Access members + galleries). |
| 17 | Escalation note inline in the metadata row | `web/src/features/escalation/EscalatedIntakeNote.tsx` + `web/src/features/requests/components/RecordDetailPage.tsx` (+ `recordDetail.css`) | none | Move the note into the status/assignee/priority row (chip/inline). Don't let the row jump when it's long/absent. |
| 18 | Sticky edit controls on long records | `web/src/features/requests/components/RecordDetailPage.tsx` + `recordDetail.css` | none | Sticky/floating Edit/Save/Cancel bar; only when the section is editable; keep off content on mobile. |
| 6 | Switcher lands on the workspace's Requests list | `web/src/shared/components/Layout/WorkspaceSwitcher.tsx`; the active-workspace context (see `ActiveWorkspaceContext` / `useActiveWorkspaceId`) | none | On switch, navigate to `/requests` for the new workspace instead of staying on the current (now foreign) route. |
| 20 | Toolkit "new item" → its own page | `web/src/features/toolkit/components/ToolkitEditorSheet.tsx` (currently a side sheet) + `ToolkitSurface.tsx`; add a route in `web/src/App.tsx` | maybe none (reuse existing create API) | Mirror the new-request page pattern (`web/src/features/requests/components/IntakeFormPage.tsx`). Retire the side-sheet create path. |

**Testing focus:** jest-axe on the changed components (esp. the portaled popover open state, sticky bar states); a Playwright check that switching workspace lands on `/requests`.

---

## Cluster B · Small field enhancements — items 4, 19
**Effort: S–M. Warms up the field engine you'll need for cluster H.**

- **#19 — Tech/stack → multi-select.** Change the field definition's kind to multi-select and make the control render/store multiple values.
- **#4 — Inline "add choice" from a field dropdown (admin-gated).** Add "+ Add option" at point-of-use for platform/workspace admins; persists to the field definition.

**Entry points**
- Web control + form: `web/src/shared/fields/fieldForm.ts`, `web/src/features/requests/components/RequestFieldControl.tsx`, `web/src/features/fields/*` (definition editor).
- API: `api/Api/Modules/Fields/*` — `FieldSchemaService`, `FieldDtos.cs`, `FieldsController.cs`.
- DB: `database/procedures/fields/*` — esp. `usp_UpsertFieldDefinition` (option lists live in `dbo.SelectOption`).
- Rules: `web-component-architecture.md`, `web-styling.md`, `database-stored-procedures.md`.

**Open decisions:** multi-value rendering in list/table + CSV export (comma-join?) and migration of existing single values (#19); option scope workspace-local vs global + admin gate (#4). **New migration if the field-kind or option storage changes → `104`.**

---

## Cluster D · Task system overhaul — items 24, 21, 22, 23, 11 — ✅ DECISIONS LOCKED
**Effort: L. One cohesive body of work. Build in the order below.**

**Decided (locked):**
- **Task status set = `Open · Locked · Done · Waived`.**
  - **Locked is DERIVED, not a stored value** — a task in a stage the record hasn't reached yet renders Locked (greyed, not actionable) and **auto-unlocks to Open** when the record derives into its stage (Cluster E). Do **not** store "Locked" as a status; compute it. Stored status is effectively `{Open, Done, Waived}`.
  - **Open** = current stage, actionable, **blocks** advancing out of that stage. **Done** = complete (resolved). **Waived** = resolved-but-not-done (advance past a task that doesn't apply, without marking it Done). For the Cluster E engine, a stage is "clear" when every task is **Done or Waived**.
- **Full task CRUD: create / edit (#23) / delete / complete / waive.** **Delete = soft-delete** (`IsDeleted` + `DeletedAt`, `database-coding-standards.md`) — add `usp_DeleteTask`. Deleting the last **Open** task in the current stage re-derives (may auto-advance). Task numbers (#24) are never reused after delete.
- **Permissions:** any workspace **Member** can create / edit / complete / delete / waive; **admins** always; all **audited**. Assignee (#21) is responsibility + notified on assignment.
- **#11 bundles = workspace-local** (editing a bundle does not change records that already applied it — copies). **#24 numbering = per-request sequential** `AIS-…-T003`, stable, never reused, in the CSV export.

Shared surface for all of these:
- **Web:** `web/src/features/tasks/*` — `TasksTab.tsx`, `TaskRow.tsx`, `TaskGroup.tsx`, `TaskComposer.tsx`, `useTasks.ts`, `taskView.ts`, `api.ts`.
- **API:** `api/Api/Modules/Tasks/*` (+ `Task` entity in `api/Api/Data/Entities.cs`).
- **DB:** table migration `20260704_033_CreateTasks.sql`; procs `database/procedures/tasks/` — `usp_CreateTask`, `usp_PatchTask`, `usp_GetTasksForRequest`, `usp_GetTaskById`, `usp_ApplyTaskBundle`, `usp_GetTaskBundleTemplates`.
- **Rules:** `web-component-architecture.md`, `web-testing.md`, `database-coding-standards.md`, `database-migrations.md`, `database-stored-procedures.md`, `api-record-access.md`.

**Build order:**
1. **#24 — Stable task identity (schema first).** Add a per-request sequential task number → surface as `AIS-00000012-T003`. **Migration `104`** (add column + backfill in a separate data migration; never reuse numbers after delete). Add it to the Task CSV export columns (`api/Api/Modules/ImportExport/*`).
2. **#21 — Assign to a workspace member.** Add `AssigneeUserId` to the task; assignee picker limited to **active** members (reuse the member-options pattern from `web/src/features/users/components/ApproverMemberCombobox.tsx`). Extend `usp_CreateTask` / `usp_PatchTask`.
3. **#22 — Task-line rework.** Drop the **Promote** button in the AI Solutions workspace (`usePromoteTask` in `useTasks.ts`; hide by workspace kind `ai-solutions`). Show **assignee / status / due date / notes icon** on `TaskRow.tsx`. Status pill uses the `Open · Locked · Done · Waived` set above (Locked = greyed/non-actionable, derived). Notes/comments → reuse the **comments** feature (`web/src/features/comments/*`, `usp_*Comment` procs) scoped to a task.
4. **#23 — Edit + delete a task.** Full edit (title, assignee, due date, phase, typed fields) via `usp_PatchTask`, **plus soft-delete via a new `usp_DeleteTask`** — a task detail sheet with a Delete action. Any Member; admins always; audited (per Decided block).
5. **#11 — Manage task bundles (admin screen).** New workspace-admin surface to CRUD bundle templates (today only `usp_ApplyTaskBundle` / `usp_GetTaskBundleTemplates` exist — **you'll add bundle CRUD procs + a migration** for editable bundles). Editing a bundle must **not** retroactively change records that already applied it (applied tasks are copies).

**Watch-outs:** #21/#22/#23 all edit `TaskRow`/`TasksTab` — build them as one slice to avoid three passes over the same files. **Locked is computed by the Cluster E engine, not stored** — keep the two in sync. **Waived** must count as "resolved" everywhere the engine checks stage completion.

---

## Cluster E · Derived-stage automation — items 1, 2, 5 — ✅ DECISIONS LOCKED
**Effort: L+ (bigger than it looks — a server-side derivation engine + removing the manual advance path). Depends on cluster D (task state). Build D first.**

**The model (decided): a record's current stage is DERIVED from its task + gate state, not set manually. The record always parks at the earliest stage with unfinished work, and moves BOTH directions automatically.**

**Derivation rule** (server-side, single source of truth — scan the lifecycle's stages in order):
1. For each stage S in order: if S has any **incomplete task** → current stage = S, stop.
2. If S's tasks are all complete, look at the gate on the S→next transition:
   - Gate exists and **not approved** → record sits at S, that gate is **open/pending**, stop.
   - No gate, or gate **approved** → advance to next stage, continue.
3. Reach the end (all tasks done, all gates approved) → final stage / ready to close.

**Behaviors (all decided):**
- **Fully automatic — no manual "Advance" button.** The stepper becomes a **read-only reflection** of the derived stage (it moves both ways); it's a trail, not a control (`steppers-and-wizards.md`).
- **Empty stages auto-skip** — a stage with no tasks and no gate is passed through on entry; a new request can cascade through empty early stages instantly to the first stage that has tasks or a gate.
- **Task status ↔ engine:** a stage is "clear" (its tasks don't block) when every task is **Done or Waived**; an **Open** task blocks; **Locked** is the derived label for tasks in stages the record hasn't reached yet (auto-unlocks to Open on arrival). Full status set is in Cluster D.
- **Auto-advance forward** when the last incomplete task in the current stage is checked off (re-derive → move; open the gate if the next transition has one; on gate approval, auto-advance).
- **Tasks AND gates are both prerequisites** to cross a transition. Gate approval stays a human action; once approved the record auto-advances.
- **Auto-revert backward:** adding a task to (or un-checking a completed task in) an already-passed stage makes that stage have incomplete work → re-derive → the record moves BACK to that stage. Completing it re-advances.
- **Gate approvals persist across revert** — re-crossing a previously-approved gate does NOT re-open it.
- **Terminal (Closed/Delivered) records do NOT auto-revert.** Derivation applies to in-flight records only; adding a task to a closed record does not change its stage. Reopening stays the admin action (backlog **#7**). **Decided: block adding tasks to a closed record.**
- **#5 — gates up front:** on creation, list all the lifecycle's gates in Tasks & gates as **greyed read-only "upcoming" rows**; a gate becomes actionable/open only when the record derives to that transition.
- **#2 — "status":** this is the **stage stepper** reflecting the derived stage. The **In progress / On hold** status stays a separate manual concept, and **On hold still pauses task completion** → no auto-advance/revert while on hold.

**Build notes**
- **Recompute the derived stage server-side on every trigger:** task create / complete / uncomplete / delete, gate approval, lifecycle change. **Persist** the derived stage on the record; the stepper just reads it. Do **not** compute in the client (guard against drift).
- Auto-opening a gate **reuses today's gate machinery** (`database/procedures/gates/*`, the `ApprovalRequest` / `usp_SubmitDecision` path) — just triggered by derivation instead of a manual advance click.
- **Remove the manual advance path** (`useSetStage` / `setRequestStage` / `POST /v1/requests/{id}/stage` + the stepper's advance control) for regular users; **Decided: keep a thin admin-only stage override** for edge cases. Existing records need a **one-time backfill** that derives their stage under the new rule (a data migration).
- Entry points: `web/src/features/requests/useRequests.ts` + `api.ts`, `web/src/features/gates/*`, `web/src/features/tasks/*` (`taskView.ts` completion), `web/src/features/lifecycle/*`; API `api/Api/Modules/{Requests,Tasks,Gates}/*`; procs under `database/procedures/{requests,tasks,gates}/`; **new migration ≥ 104** for the persisted derived stage + backfill.
- Rules: `api-record-access.md`, `database-stored-procedures.md`, `database-migrations.md`, `web-testing.md`, `steppers-and-wizards.md`.

**Sequencing:** build **Cluster D first** — derivation reads task state (completion, add/remove). Then the derivation engine, then the UI (read-only stepper + #5 upcoming gates).

---

# P2 (after P1 — suggested order, adjust freely)

### Cluster C · Link-a-record dropdown — #8 *(M)*
Record-ID picker showing `ID — name`. Web: `web/src/features/relationships/*` (`RelationshipsSidePanel.tsx`, `useRelationships.ts`, `api.ts`). DB: `database/procedures/relationships/` (`usp_ListRecordLinks`, `usp_UpsertRecordLink`) + likely a new "list available records for linking" read proc. Decide the candidate set (current workspace, exclude self + already-linked) and typeahead.

### Cluster F · Watchers — #9, #10 *(M)*
Web: `web/src/features/watchers/*`. DB: `database/procedures/watchers/` — **`usp_RemoveWatcher` already exists** (#10 is mostly wiring the UI + permission decision); **`usp_AddWatcher` currently guards on workspace membership** so #9 (add a non-user by email) needs a schema/proc change to store a free-email watcher + email-only notification path. Decide storage (free email vs lightweight contact) and who can add/remove.

### Cluster G · Users, access & platform — #28, #14, #7, #15 *(M–L)*
- **#28 + #14 (same admin surface):** membership create/edit under `web/src/features/users/*` — add "Dashboard only" toggle (sets `isDashboardViewer` + `boundDashboardId`; Viewer-level only; bound surface already exists at `web/src/features/dashboards/components/DashboardViewerPage.tsx`) and platform-first user provisioning (reconcile with first-sign-in auto-provision in `EnsureUserMiddleware` — see `api-auth.md`). Procs: `database/procedures/users/*`.
- **#7 Reopen closed record (admin-only):** status override under `web/src/features/requests/*` + `web/src/features/closure/*`; add an admin-gated reopen proc. Decide landing status + audit + whether stage/tasks reactivate.
- **#15 Crossing map:** `web/src/features/platform-admin/components/CrossingMapPage.tsx` — add a workspace selector and label the PG/dept + AI-solutions field sources.

### Cluster H · Configurable request UI — #26, #27 *(XL — own design cycle)*
Admin-configurable request-page tabs/fields (#26) + configurable create forms (#27). **Do not scope as a normal slice** — this needs a design cycle: a config data model (tab list + per-tab layout, workspace vs global), how a new tab like "QA bugs" gets its own fields (ties to the fields/custom-objects engine), how built-in tabs coexist, and migration when layouts change under existing records. Touches `web/src/features/requests/components/RecordDetailPage.tsx` + `IntakeFormPage.tsx`, the fields engine, and new admin surfaces. **Warm up via clusters B + G first.**

### Cluster I · AI-assist "Ask" default-on — #13 *(S build; ⚠️ product decision)*
Small implementation (star next to `web/src/shared/components/Layout/WorkspaceSearch.tsx` / `TopBar.tsx`; feature at `web/src/features/ask/*`; flag `AiAssistEnabled` via `web/src/features/ai-config/*`) — **but it reverses the current default-off, per-workspace opt-in.** Get the policy decision (and whether platform admins keep a global kill-switch, given the AI content-field allowlist / data-handling guardrails) before building.

---

## Suggested first three slices (to hand the developer a running start)
1. **A/#16** (copy) + **A/#3** (filter portal) — trivial, prove the build/ship loop.
2. **A/#12, #17, #18, #6, #20** — the rest of the quick wins.
3. **B/#19 + #4** — first touch of the field engine, then start **Cluster D** with **#24** (the schema foundation).

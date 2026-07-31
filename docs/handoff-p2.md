# Developer Handoff — Intake Tracker (Part 2 / P2)

> The **second** work package for the Intake Tracker backlog — P2 clusters **C, F, G**, plus
> **J, K, M** from the analyst pilot-feedback round and **N** (two live no-op fixes from the loose-ends audit — see `loose-ends.md`).
> **Two clusters were re-bucketed to P3 (`handoff-p3.md`): H (configurable request UI) and
> L (roadmap / bulk actions / measured effort)** — the bigger design cycles.
> P1 (clusters A, B, D, E) is a separate handoff (`handoff.md`). Item numbers (e.g. **#9**) map to
> [`backlog.md`](backlog.md), included in this zip.
>
> _Prepared: 2026-07-30. Pilot-feedback clusters (J, K, M here; H, L moved to P3) added 2026-07-30
> after triaging analyst feedback against the **current** code — several Jul-15–20 complaints were
> already fixed by then and are listed under "Verified already-shipped" rather than as build items._

---

## 0. Read me first — how to work in this repo

- **Monorepo:** `web/` (React 19 + TypeScript 5, webpack, Node 24), `api/` (ASP.NET Core net10.0, EF Core for single-table CRUD + **stored procs for everything else**), `database/` (Azure SQL; migrations `database/migrations/`, procs `database/procedures/<group>/`). Shared wire types in `shared/types/*.ts` — change these first.
- **Build workflow:** `/plan` → `/build` → `/dev-review-and-remediate` → `/ship`. Direct `git commit` is blocked; **`/ship` is the only path to a commit**. If not using the Claude harness, follow the same gates manually (`npm run lint`, `npm run test:coverage`, `dotnet test`, tSQLt) + the rule files below.
- **Rules before touching a layer:** `.claude/rules/dev/_core-requirements.md` first; then web (`web-component-architecture.md`, `web-styling.md` incl. `data-ds`, `web-testing.md`), api (`api-record-access.md` — **ownership → 403, never 404**; `api-error-handling.md`; `api-validation.md`; `api-auth.md`), db (`database-coding-standards.md` — PK + 6 audit columns + soft-delete on every table; `database-migrations.md`; `database-stored-procedures.md`).
- **Design tokens only** — no raw hex/px; every design-system component sets a stable `data-ds="<type>"`. **Tests ship in the same slice.**

### ⚠️ Migration numbering — coordinate with the P1 developer
Both handoffs add migrations **≥ 104**. **Check the current highest number in `database/migrations/` at the start of every slice and take the next free one** — don't assume `104` is free if P1 is in flight. Format `YYYYMMDD_NNN_Description.sql` + a `_Rollback.sql`.

### Permission model (reference)
`AccessLevel = 'Viewer' | 'Member' | 'WorkspaceAdmin'` ([`shared/types/common.ts`](../shared/types/common.ts)) — ordered + additive. Platform admin is a separate additive firm-wide grant. Server gate: `AccessGuard.HasWorkspaceLevelAsync(userId, workspaceId, WorkspaceLevel.X)` ("at least X"). Viewer = read-only whole workspace; Member = +edit records; WorkspaceAdmin = +admin surfaces.

### Two domain facts P2 depends on
- **Stage is derived from task/gate state** (the P1 **Cluster E** model). Relevant to **#7** (reopen re-derives). If Cluster E isn't built yet, see the dependency note under #7.
- **One field/object metadata engine:** `ObjectType` + custom objects, driven by `FieldSchemaService` (API) + `usp_UpsertFieldDefinition` + `shared/fields/fieldForm.ts` (web). Touched by **K1** (task field picker) here, and central to **cluster H** (now P3).

---

## Suggested order within P2: C → F → G → N, then the pilot-feedback clusters J → K → M  *(N = fix the two live no-ops before next release; M is cheap polish — slot it in anytime)*

---

## Cluster C · Link-a-record dropdown — #8 — ✅ DECIDED
**Effort: M.** Replace the free-text record-ID entry on **Link a record** with a **dropdown / typeahead** showing `ID — request name` (e.g. `AIS-00000012 — Deposition summarizer`).

- **Decided:** candidates = **current workspace only**; **exclude the record itself and already-linked records**; **typeahead** search for large sets.
- **Web (audited — pointer corrected):** the **live** relationships UI is `web/src/features/typed-links/RelationshipsCard.tsx` + `web/src/features/relationships/GenericRelatedRecordsTab.tsx` (rendered on the record detail). **⚠️ Do NOT edit `relationships/RelationshipsSidePanel.tsx`** — it is **dormant/unreachable** (imported by no surface) and its per-row "Link a record" never renders. Related finding: the config-driven relationship tab (`GenericRelatedRecordsTab`) is currently **read-only — no link/create affordance** — Cluster C should add the create/link control there.
- **DB/API:** `database/procedures/relationships/` (`usp_ListRecordLinks`, `usp_UpsertRecordLink`) **+ a new read proc** to list linkable candidate records (id + name, filtered per the decision). Controller/service `api/Api/Modules/Relationships/*`.
- **Rules:** `web-component-architecture.md`, `database-stored-procedures.md`, `api-record-access.md`.

---

## Cluster F · Watchers — #9, #10 — ✅ DECIDED
**Effort: M.**

- **#10 — Remove watchers:** any **Member** can remove (admins always); **audited**; **no** "you've been removed" email. `usp_RemoveWatcher` **already exists** — this is mostly UI wiring + the permission/audit.
- **#9 — Watch a record without a workspace account (email-only watcher):** the recipient is a **firm employee who has no workspace account** and just wants email notifications without logging in — **directory-resolvable** (the app already looks users up by email via Graph). Any Member can add an **existing member** as an in-app watcher; adding an **account-less firm employee is WorkspaceAdmin-only**.
  - **⚠️ Scope split (front-loaded decision):** the **in-app** watcher parts (**#10** + add-existing-member) build in **P2 now**. The **email-notification** part is a **fast-follow slice** — **the app has NO outbound email today**. The sanctioned internal path is **Microsoft Graph `sendMail`** via Managed Identity, which needs **IT to grant the `Mail.Send` app permission** (flag IT now so it's ready when the slice starts). Recipients are internal firm employees → **no Legal escalation**.
  - **Decided — cadence:** an email-only watcher gets **one email per watched event** (mirror the in-app bell's triggers).
  - **DB/API:** `database/procedures/watchers/` — `usp_AddWatcher` currently **guards on workspace membership**; add a path that accepts a firm-directory email and enforces the **WorkspaceAdmin** gate. Schema: store the account-less watcher as an email string (no user id) — nullable `WatcherEmail` or a `WatcherType` discriminator (dev's call).
- **Web:** `web/src/features/watchers/*`.
- **Rules:** `api-record-access.md`, **`api-pii-handling.md`** (watcher emails are PII — never logged), `api-client-auth.md` (Graph user lookup), `database-coding-standards.md`.

---

## Cluster G · Users, access & platform — #28, #14, #7, #15 — ✅ DECIDED
**Effort: M–L.**

### #28 + #14 — one admin surface (membership create/edit under Users & Access)
- **#28 Dashboard-only:** a toggle in membership **create + edit**, **enabled only at Viewer level**, that requires **picking which dashboard** to bind. Sets the existing `isDashboardViewer` + `boundDashboardId`; the bound surface already exists (`web/src/features/dashboards/components/DashboardViewerPage.tsx`). Bound user's nav = just that dashboard.
- **#14 Platform-first users:** platform admin adds a user **by directory email lookup** — the app already resolves users by email (Graph `User.Read.All`; see `api-client-auth.md` → *MI Graph permission for user lookup*). Seed the user record before any workspace grant; **reconcile on first sign-in by email** so `EnsureUserMiddleware`'s auto-provision doesn't create a duplicate (match the seeded row by `preferred_username`/email — see `api-auth.md`).
- **Web:** `web/src/features/users/*` (member add/edit). **DB/API:** `database/procedures/users/*` (`usp_UpsertWorkspaceMembership` + a new platform-user create proc), `api/Api/Modules/Users/*`, `EnsureUserMiddleware`.
- **Rules:** `api-auth.md`, `api-client-auth.md`, `api-record-access.md`, `api-pii-handling.md`.

### #7 — Reopen a closed record (admin-only)
- **Decided:** **WorkspaceAdmin-only.** Reopen sets status **In progress** and lets the **Cluster E engine re-derive** the stage from current task/gate state. **Audited.**
- **Dependency + decided fallback:** the re-derive needs **P1 Cluster E**. If E isn't built yet, **record the record's stage at close-time and restore it on reopen** ("where it left off") — then wire the re-derive when E lands (E overrides the restored stage). **Coordinate with the P1 developer.**
- **Web:** `web/src/features/requests/*`, `web/src/features/closure/*`. **DB:** a new admin-gated reopen proc in `database/procedures/requests/`. **Rules:** `api-record-access.md`, `database-stored-procedures.md`.

### #15 — Crossing map
- **Decided:** add **workspace** as an additional selectable dimension alongside the PG/dept + AI-solutions fields, and **label each field's source on-screen** (which catalog/field feeds each).
- **Web:** `web/src/features/platform-admin/components/CrossingMapPage.tsx` + its api. First task: trace where the PG/dept and AI-solutions option lists come from — the on-screen labels should name that source.

---

## Cluster N · Finish two live "no-op" controls (from the loose-ends audit) — ✅ DECIDED (finish both)
**Effort: S–M.** Two controls that render and accept input today but do nothing. **Decided: finish both** — act before the next release.

### N1 — @mentions in comments send a notification
The comment composer highlights `@handle` and previews "Mentions: @x", but `mentionedUserIds` is hardcoded `[]` (`web/src/features/comments/ActivityTab.tsx:142-144`) — a mention **notifies nobody**. **Decided:** a mention **sends an in-app notification** to the mentioned user.
- **Web:** capture real user-ids — recommended via an **@-mention typeahead** picking from **workspace members** (reuse the member-options pattern, e.g. `ApproverMemberCombobox`) so the id is captured directly rather than fuzzy-matching free text; populate `mentionedUserIds` on post.
- **API:** the comment-post path accepts `mentionedUserIds` and **fans out one in-app notification per mentioned member** (reuse the notification/event spine + bell feed — `usp_FanOutNotification`). Only workspace members are notified; don't notify a self-mention; audited.
- **Rules:** `api-record-access.md`, `api-pii-handling.md` (never log mention/comment content), `web-component-architecture.md`.

### N2 — Copy record: attachments accessible in the copy
The "include attachments" checkbox posts `includeAttachments`, but `CopyService` never reads it (`api/Api/Modules/TypedLinks/CopyService.cs`; web `web/src/features/typed-links/CopyModal.tsx`) — a silent no-op even though Attachments now exists. **Decided:** when checked, the **copied record's attachments are accessible in the copy**.
- **API:** in `CopyService`, when `includeAttachments`, create a **new `Attachment` row per source attachment on the copied record** (new `AttachmentId`). Recommended: **duplicate the blob** (stream the source blob to the new opaque key) so the copy is **isolated** — deleting one record's attachment must not affect the other; sharing the same blob path is the alternative but couples them (dev's call, lean duplicate). Verify the caller can access the source record + its attachments first.
- **Rules:** `api-blob-attachments.md`, `api-record-access.md`, `api-pii-handling.md`.

---

# Analyst pilot feedback (2026-07-20 round) — P2 clusters J, K, M

These clusters come from a round of analyst pilot feedback. Every item was **triaged against
the current code** before landing here — the ones already fixed since the feedback are in the
"Verified already-shipped" table at the end, not as build items. File/proc pointers below were
traced in the current tree; treat them as starting points, not gospel, if the code has moved.
_(A fourth feedback cluster — **L**: roadmap / bulk actions / measured effort — was re-bucketed
to **P3**; see `handoff-p3.md`.)_

## Cluster J · Intake & request UX — 🚧 NEEDS DECISIONS (framing captured)
**Effort: M.**

### J1 — Post-submission confirmation (stop the jarring instant submit) — 🆕
On submit the intake form navigates straight to `/requests/{id}` (`web/src/features/requests/components/IntakeFormPage.tsx` — the `handleSubmit` onSuccess `navigate(...)`). **Decided:** add a brief **"Submission successful"** step offering **View request** and **Submit another** (the latter resets the form in place — no round-trip back through the list, which also fixes the "slow to submit a second request" complaint).

### J2 — Show "Submitted by" on the record — 🆕 small
The submission **date** is already surfaced ("Submitted" = the record's `createdAt`, on `RecordDetailPage.tsx`). **Submitted by** is captured (`CreatedBy`, in `RequestDtos.cs`) but never rendered for a Request. **Decided:** surface it next to the submitted date. Small.

### J3 — Analyst-owned priority (editable from the Requests list) — 🆕
Today "priority" is **only a computed score** (Business Value + Efficiency − Effort, from three sliders) and is **read-only** on the list/board/dashboard (`RequestsListPage.tsx` renders it as static text).
- **Decided (priority model):** add a **manual analyst-set priority** that is **authoritative**; the computed score becomes a **suggestion** shown alongside it. Analyst priority is editable **inline on the Requests list** and on the detail — **Members edit, Viewers read-only** — and is **bulk-settable** (see **L2**, P3). The **submitter never sets priority** (the sliders come off the intake form via configurable forms — **#26/#27, P3**).
- **New field** (analyst priority) on the request — coordinate with the field engine; keep the computed score as the suggestion, don't remove it.
- **⚠️ Audited — build-from-scratch, not a tweak:** no manual/override/level priority field exists today; `PriorityScore` is a **persisted computed column** (`…029_CreateRequests.sql`) + the `computePriorityScore` TS formula. Also the dashboard composer **hardwires "high priority = 5+"** (`widgetTypeCatalog.ts`) — reconcile that threshold once an authoritative priority exists.
- **Web:** `RequestsListPage.tsx` (inline edit) + request detail. **DB:** request schema + update proc. **Rules:** `api-record-access.md` (Member-gates the write).

> **Not built here (resolved elsewhere):** analyst-only intake fields (the create form currently
> shows the submitter the value/priority sliders, Assigned Analyst, and Due Date) — this is being
> resolved by the **configurable intake forms** work (#26/#27), so it is intentionally **not** a
> separate J item.

---

## Cluster K · Tasks & activity — 🚧 NEEDS DECISIONS
**Effort: M.**

### K1 — Scope task capture-fields to the task's phase (reuse "Visible on stages") — 🆕
The "Add task" field picker (`web/src/features/tasks/TaskComposer.tsx`) lists the **entire** task-field library regardless of phase, so e.g. a "go-live date" can be attached to an Intake task. The field system **already has** a **"Visible on stages"** setting — it just isn't applied here: `TaskLibraryFieldDto` (`api/Api/Modules/Fields/FieldDtos.cs` + `FieldSchemaService.GetTaskLibraryAsync`) doesn't even carry the visible-stages value. **Decided:** carry each task field's Visible-on-stages through to the picker and **filter it by the current task's phase**. **Decided — default:** a task field with **no** Visible-on-stages restriction shows on **every** phase (unrestricted = universal). **⚠️ Known mismatch (audited) — bigger than a UI filter:** the Visible-on-stages checkboxes use **Request stage keys** (`intake…closure`, `fields/constants.ts` `STAGE_KEYS`) while tasks use a **different `TaskPhase` vocabulary** (`Intake…Closeout/Unphased`, `shared/types/tasks.ts`); and `TaskLibraryFieldDto` + `usp_GetTaskField` **do not return** the visible-stages value. So K1 also needs to **surface visible-stages on the task read path** and **reconcile the stage-vs-phase vocabulary** — not just filter the picker. Sits next to the P1 task overhaul (Cluster D #22/#23), which already edits this picker — coordinate. _Not covered by P1: P1 edits task typed-fields + phase but adds no field↔phase constraint._

### K2 — Warn on duplicate tasks — 🆕
No uniqueness guard anywhere (`usp_CreateTask.sql`, `TasksService`, `TaskComposer`); bundles (`usp_ApplyTaskBundle`) can be re-applied wholesale. **Decided:** **warn, don't block** — flag when a task's title already exists in the same phase, let the user proceed; bundle re-apply skips already-present tasks.

### K3 — Readable task/attachment activity entries — 🆕
Task changes **are** logged, but every patch emits a generic `task.updated` with payload `{ taskId }` only → renders as an undifferentiated "Task updated" with no task name and no open-vs-close distinction (attachment events have the same problem). Source: `TasksService` `EmitAsync`, surfaced via `usp_GetActivityThread.sql` + `ActivityTab.tsx`. **Audited — clean seam:** summaries are built server-side in one place — `CommentsService.SummariseEvent(eventType, payloadJson)` (a `switch` + `Prettify` fallback); the frontend renders `event.summary` verbatim. So K3 = **add cases to `SummariseEvent`** (+ optionally the `eventIcon` switch), no new registry needed. **Decided:** give task and attachment events human-readable summaries — name the task and say what happened (e.g. "Marked 'Kickoff call' done", "Reopened 'Draft SOW'", "Added attachment brief.pdf"). **Decided — which events get a distinct named entry:** task **created / completed / reopened / waived / reassigned / due-date changed**, plus **attachment added / removed**. Minor field-value edits stay the generic "updated" entry.

---

## Cluster M · Admin & UI consistency — 🧹 POLISH
**Effort: S–M.**

### M1 — Feature Catalog vs Toolkit: say what each is — 🆕 small (copy)
The two surfaces are genuinely distinct (Feature Catalog = hub-only taxonomy of shipped features; Toolkit = per-workspace playbooks/plugins/prompts) but each shows only a title with identical chrome, so the difference isn't communicated (`FeatureCatalogPage.tsx`, `toolkit/…ToolkitSurface.tsx`, `navItems.ts`). **Decided — copy:** Feature Catalog subtitle → *"Browse AI features and solutions built across the firm."* · Toolkit subtitle → *"Playbooks, prompts, and plugins for this workspace."*

### M2 — One disclosure pattern + outside-click-close + spacing sweep — 🆕
Analysts report workspace **and** platform admin tabs mix pop-ups, sliding panels, and breadcrumbs, with inconsistent spacing (Lifecycle & Gates worst). Concrete gap found: the shared side-sheets (`SideSheet`, `ComposerSheet`) close on scrim + Escape, but the **Fields-admin editor** (`fields/components/FieldEditorSheet.tsx`) is an inline non-modal panel that closes only via Escape/X. **Decided:** standardize admin surfaces on one disclosure pattern (the shared side sheet, per `disclosure-surfaces.md`), add **outside-click-close everywhere** (Fields editor first), and normalize tab spacing (Lifecycle & Gates first).

---

## Verified already-shipped — no action (checked against current code, 2026-07-30)

These pilot-feedback items were already fixed by the time of triage; listed so they aren't re-raised.

| Feedback | Status in current code |
|---|---|
| #2 — accounting "lanes" to tag the driving group | Self-resolved — a **custom field** covers it. |
| #3c — drafts can't be accessed | Full **Save-draft + Drafts page** (Resume/Discard) exists. |
| #3d — auto due-dates in past/future, no year | No auto-assign (blank stays blank); all dates show the **year** (shared `dateFormat` util). |
| #4l — attachments "don't work" | **Fully wired** both ways (upload → Blob → SQL, authenticated download). If it fails live it's env/config, not missing code. |
| #4n — "status override only changes Display Status" | **Resolved** — Display Status is now derived; the picker writes real state. Advancement is P1 **Cluster E** (derived stage). |
| #4o — Abandoned does nothing | **Resolved** — retired and folded into the Close flow (Withdrawn/NotPursued); legacy rows migrated. |
| #6a — search doesn't work | Search is **wired** on Feature Catalog / Toolkit / Requests. |
| #7c — lifecycles: no list/edit/save, can't delete | List / edit / autosave / guarded delete all **exist**. (Create-time validation gap noted but user chose to skip.) |
| #7d — new announcements don't show | A **publish-now** announcement surfaces immediately. |
| Search scope (title+ID only) | Already searches **name, description, record ID, legacy ID, comment bodies, attachment filenames**. |
| Capacity view (who's carrying how much) | The **Workload dashboard** + "Open records per analyst" widget already answers this (current-load, not a forward planner). |

---

## Out of scope in this package
- **Cluster I · #13 — AI-assist "Ask" default-on.** Deferred — AI enablement to be tackled later (a policy call, not built here).

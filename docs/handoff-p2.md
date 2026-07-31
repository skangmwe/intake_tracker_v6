# Developer Handoff — Intake Tracker (Part 2 / P2)

> The **second** work package for the Intake Tracker backlog — P2 clusters **C, F, G, H**.
> P1 (clusters A, B, D, E) is a separate handoff (`handoff.md`). Item numbers (e.g. **#9**) map to
> [`backlog.md`](backlog.md), included in this zip.
>
> _Prepared: 2026-07-30._

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
- **One field/object metadata engine:** `ObjectType` + custom objects, driven by `FieldSchemaService` (API) + `usp_UpsertFieldDefinition` + `shared/fields/fieldForm.ts` (web). Central to **cluster H**.

---

## Suggested order within P2: C → F → G → H  *(H is a design cycle — do it last / in parallel design)*

---

## Cluster C · Link-a-record dropdown — #8 — ✅ DECIDED
**Effort: M.** Replace the free-text record-ID entry on **Link a record** with a **dropdown / typeahead** showing `ID — request name` (e.g. `AIS-00000012 — Deposition summarizer`).

- **Decided:** candidates = **current workspace only**; **exclude the record itself and already-linked records**; **typeahead** search for large sets.
- **Web:** `web/src/features/relationships/*` — `RelationshipsSidePanel.tsx`, `useRelationships.ts`, `api.ts`.
- **DB/API:** `database/procedures/relationships/` (`usp_ListRecordLinks`, `usp_UpsertRecordLink`) **+ a new read proc** to list linkable candidate records (id + name, filtered per the decision). Controller/service `api/Api/Modules/Relationships/*`.
- **Rules:** `web-component-architecture.md`, `database-stored-procedures.md`, `api-record-access.md`.

---

## Cluster F · Watchers — #9, #10 — ✅ DECIDED
**Effort: M.**

- **#10 — Remove watchers:** any **Member** can remove (admins always); **audited**; **no** "you've been removed" email. `usp_RemoveWatcher` **already exists** — this is mostly UI wiring + the permission/audit.
- **#9 — Add external (non-user) watcher by email:** any Member can add an **existing member**; adding an **outside email is WorkspaceAdmin-only**. Needs: store a **free-email watcher** (email string, no user id) and an **email-only** notification path.
- **DB/API:** `database/procedures/watchers/` — `usp_AddWatcher` currently **guards on workspace membership**, so add an external path (param/variant) that accepts a raw email and enforces the **WorkspaceAdmin** gate for off-member addresses. Schema: a nullable `WatcherEmail` (or a `WatcherType`) alongside the existing user-id watcher.
- **Web:** `web/src/features/watchers/*`.
- **Rules:** `api-record-access.md`, **`api-pii-handling.md`** (watcher emails are PII — never logged), `database-coding-standards.md`.

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
- **Dependency:** the re-derive behavior needs **P1 Cluster E**. If E isn't built yet, ship #7 as "reopen → In progress + a sensible restore stage" and wire the re-derive when E lands — **coordinate with the P1 developer.**
- **Web:** `web/src/features/requests/*`, `web/src/features/closure/*`. **DB:** a new admin-gated reopen proc in `database/procedures/requests/`. **Rules:** `api-record-access.md`, `database-stored-procedures.md`.

### #15 — Crossing map
- **Decided:** add **workspace** as an additional selectable dimension alongside the PG/dept + AI-solutions fields, and **label each field's source on-screen** (which catalog/field feeds each).
- **Web:** `web/src/features/platform-admin/components/CrossingMapPage.tsx` + its api. First task: trace where the PG/dept and AI-solutions option lists come from — the on-screen labels should name that source.

---

## Cluster H · Configurable request UI — #26, #27 — 🚧 FRAMING (confirm in a design session before build)
**Effort: XL.** This is the framing you asked for — a **first cut to validate in a short design session**, not a final spec.

**Concept:** an admin-edited **layout config** that the request **detail page** (tabs + fields) and the **create forms** read from, instead of hard-coded layout.

**First-cut data model:**
- **Tabs** (per `WorkspaceId` × `ObjectType`): `key`, `label`, `order`, `isBuiltIn`, `kind`. Built-in tabs (Status, Tasks & gates, Attachments, Watchers, Activity, Relationships) can be **reordered / renamed / hidden — not deleted**; admin tabs (e.g. "QA bugs") are **custom**.
- **Tab content:** an ordered set of field references (from the field catalog for that object type), grouped into sections, with per-surface flags.
- **Create-form layout (#27):** a separate, simpler ordered field list + required flags per object type (create forms have no tabs), reusing the same field catalog.
- **Scope layering:** a **platform-global default** config + a **workspace override** (workspace admin edits local; platform admin edits global; workspace wins where present).

**Key decisions to lock in the design session:**
- **Custom-tab content:** does a tab like "QA bugs" host (a) a **group of extra Request fields**, or (b) an **embedded list of a linked custom object** (QA Bug records)? Recommend supporting **both, field-group first**; option (b) ties into the custom-objects/records engine (`web/src/features/objects/*`, `custom-records/*`).
- **Versioning/migration:** records render against the **current** layout (no per-record snapshot). Removing a field **hides** it, never deletes stored data; a changed required-rule applies to **new edits**, not retroactively.
- **Built-in-tab hiding:** the load-bearing tabs (Status, Tasks & gates) probably shouldn't be hide-able — confirm.

**Entry points:** `web/src/features/requests/components/RecordDetailPage.tsx` + `IntakeFormPage.tsx`; field engine (`api/Api/Modules/Fields/*`, `shared/fields/fieldForm.ts`); custom objects (`web/src/features/objects/*`, `custom-records/*`); **new config tables + procs** (migration coordinated). Warm-up: clusters **B (P1)** + **G** touch the same field engine.

---

## Out of scope in this package
- **Cluster I · #13 — AI-assist "Ask" default-on.** Deferred — AI enablement to be tackled later (a policy call, not built here).

# v2 Reconciliation — Architecture Addendum

*Companion to the seven core artifacts. Reads alongside `data-model.md`, `api-contracts.md`, `module-boundaries.md`, `shared-types.md`, `dependency-graph.md`, `shared-inventory.md`, `slice-plan.md`. Captures the architectural deltas introduced by the **2026-07-16 v2 prototype reconciliation** (see `full-design-blueprint.md` change log, 2026-07-16 row, and `solution-requirements.md` change log, 2026-07-16 row).*

**Not a rewrite.** The 24-slice architecture below Slice 24 stands. The completed slice log in `README.md` is not touched. Everything in this document is **additive** — new objects, new endpoints, new module ownership, new shared types, and five new slices (25–29) that pick up where Slice 24 stopped.

## Why this exists

The v2 export codified design-level concepts that were either absent from the R1 plan or built to an earlier shape. Some are pure UI reorganizations against already-shipped code (config-driven tab bar over the existing three-tab detail); others are genuinely new model work (object-level Relationships as a first-class concept, Toolkit as a new object, multi-lifecycle at intake). The addendum enumerates **which is which** so reviewers don't misjudge scope.

## v2 changes at a glance

| # | Concept | Scope of change | Slice(s) |
|---|---|---|---|
| 1 | Object-level **Relationships** as a first-class object + **Link-to-record** field type carrying `targetObjectType` / `allowMultiple` / `reverseLinkLabel` | New model, new API, new module, new shared types | **25** |
| 2 | **Config-driven detail tabs** — base tabs Status / Intake / Activity / Watchers & alerts; Tasks & gates + Attachments as relationship-driven tabs; generic related-records panel | UI reorganization of S4/S5 + relationship-tab config on the Relationships object | **25** |
| 3 | **System-provisioned fields** (Record ID / Name / Date created / Last updated / Created by) — read-only, uncreatable, surfaced as a locked row set on the Fields tab | New marker on `FieldDefinition`; seed data; UI enforcement | **25** |
| 4 | **Record Status/hold** model — In progress / On hold / Abandoned; On hold pauses task completion and gate approvals | Column change on `Request` (tri-state replaces binary `hold`); Status tab; guard in task-completion and gate-approval procs | **26** |
| 5 | **Watchers & alerts tab** — per-record notification preferences (Gate decisions · Status changes · Task sign-offs · SLA & due-date reminders · Mentions & comments) | New per-record-per-user preferences table; API; filter on the notification fan-out | **26** |
| 6 | **Multiple lifecycles per workspace** + **Lifecycle picker at intake** (replaces "Request type") | Lifecycle dropdown selector in S31; picker in S3; enforcement in stage-transition and gate-open procs | **27** |
| 7 | **Multi-dashboard composer** — Shared/Personal switcher, New dashboard side sheet, Edit layout mode, Add widget composer (widget type · metric or group-by · row limit · half/full width · dept + stage scope) | Extend `SavedDashboard` schema; new endpoints; widget-composer UI on S6 | **28** |
| 8 | **Toolkit object** (S43) — playbooks / plugins / prompts; Reference-local workspace scope | New object, new module, new module boundaries, new shared types | **29** |
| 9 | Announcement **scheduled publish + auto-archive after 30 days** | Extend `Announcement` columns; scheduler job; UI on S23 | Slice 13 follow-up (in-plan; see §Slice 13 amendments below) |
| 10 | **Structured audit columns** — `Object` + `Record ID` visible on the audit list surfaces | Read-projection extension on the audit query; UI columns added | Slice 18/19 follow-up (in-plan; see §Slice 18/19 amendments below) |
| 11 | **Import wizard UX** — target object · drop CSV/Excel · auto-map columns with per-column overrides · Skip · row count · Import rows | UI-only polish on existing S28 surface | Slice 16 follow-up (in-plan; see §Slice 16 amendments below) |
| 12 | **Grouped Workspace/Platform settings IA** with secondary side-nav — `/settings/workspace/:page` + `/settings/platform/:page`; platform-admin claim guard on platform routes | Router refactor across slices 17/18/19 admin surfaces; sidebar nav update | Slice 2/17/18/19 follow-up (in-plan; see §Slice-shell amendments below) |

Items 9–12 are **not new slices** — they are small polish tasks against already-shipped surfaces, recorded in the impacted slice docs and picked up as follow-ups by whichever slice touches that surface next.

---

## Model deltas (extends `data-model.md`)

### 1. Relationship object (new)

Owned by workspace. Auto-provisions Link-to-record fields on the owning side(s). Optionally surfaces as a Request-detail tab.

```
Relationship
  Id                   uniqueidentifier PK
  WorkspaceId          uniqueidentifier FK → Workspaces  (not null; not workspace-portable)
  Name                 nvarchar(120) not null            -- "Request has Tasks"
  FromObjectType       nvarchar(50)  not null            -- 'Request' | 'Task' | 'Feature' | 'ToolkitItem'
  ToObjectType         nvarchar(50)  not null
  Cardinality          nvarchar(20)  not null            -- 'OneToOne' | 'OneToMany' | 'ManyToMany'
  FromSideLabel        nvarchar(80)  not null            -- "Tasks"
  ToSideLabel          nvarchar(80)  not null            -- "Request"
  ShowOnFromAsTab      bit           not null default 0  -- when true, renders as a relationship-driven tab on the From-side detail
  TabLabel             nvarchar(80)  null                -- surfaced when ShowOnFromAsTab
  SortOrder            int           not null default 0  -- tab insertion order relative to other relationship tabs
  [six audit columns per database-coding-standards.md]

Unique-filtered index: (WorkspaceId, FromObjectType, ToObjectType, Name) WHERE IsDeleted = 0.
```

Auto-provisioned Link-to-record fields:

- **OneToOne**: single `RecordReference` field on the From side (`fieldKey` = From side label as key).
- **OneToMany**: single `RecordReference` field on the To side pointing back to the From side (many children → one parent).
- **ManyToMany**: `RecordReference` (multi) fields on both sides.

The generated fields are read-only in the Fields editor (edits are made via the Relationship editor); the Fields list shows them under a "Relationships" section with a lock affordance. Their `isReadOnly` = false at the record level (users still add rows via "Link a record") — the marker only applies to the *definition*.

### 2. `FieldDefinition` extensions

New columns on the existing `FieldDefinition` table:

```
IsSystemProvisioned   bit           not null default 0    -- Record ID / Name / Date created / Last updated / Created by
TargetObjectType      nvarchar(50)  null                  -- present only for FieldType='RecordReference' (Link-to-record)
AllowMultiple         bit           null                  -- present only for FieldType='RecordReference'
ReverseLinkLabel      nvarchar(80)  null                  -- present only for FieldType='RecordReference' (optional)
RelationshipId        uniqueidentifier null               -- FK → Relationships when this field was auto-provisioned by a Relationship (null when created manually)
```

Migration seeds `IsSystemProvisioned = 1` for the five system fields (Record ID / Name / Date created / Last updated / Created by) on Request, Task, Feature, and (post-Slice-29) ToolkitItem. System-provisioned rows are `isRequired = true`, `isReadOnly = true`, and cannot be deleted or renamed. UI enforcement lives in the Fields editor.

### 3. Request Status/hold — tri-state replaces binary

Replace the existing `Hold BIT` / `HoldReason NVARCHAR(200)` pair on `Request` with:

```
StatusHold      nvarchar(20)  not null default 'InProgress'   -- 'InProgress' | 'OnHold' | 'Abandoned'
StatusHoldNote  nvarchar(500) null                            -- free text; required by UI on the non-active states
```

Existing `hold: { held: boolean; reason?: string }` on `RequestDto` remains as a **derived read** for backward compat (see shared-types delta below) but the writable column is now `StatusHold`. Migration path:

- Existing rows with `Hold=1` → `StatusHold='OnHold'` with note carried over.
- Existing rows with `Hold=0` → `StatusHold='InProgress'`.

**Semantics.** `OnHold` **blocks** task completion (`usp_CompleteTask` returns 409) and **blocks** gate approval decisions (`usp_DecideApproval` returns 409). `Abandoned` blocks all mutations; the record can be reopened only by transitioning back to `InProgress`. See slice 26.

### 4. `Lifecycle` — multi-per-workspace

The existing `Lifecycle` table already supports multi-per-workspace (`WorkspaceId` FK). The v2 delta is:

```
IsDefault       bit           not null default 0     -- exactly one row per workspace marked default; enforced by unique-filtered index (WorkspaceId) WHERE IsDefault = 1 AND IsDeleted = 0
DisplayLabel    nvarchar(80)  not null               -- the single label used on the S3 intake picker AND everywhere in the UI (replaces the separate "Request type")
```

Intake writes `lifecycleId` (already on `Request`) at create time; if the request body omits it, the workspace default is used. **Backward compat:** the existing scaffold seeded one lifecycle per workspace; a migration adds `IsDefault=1` to each existing seed row.

### 5. Toolkit object (new)

New object at workspace scope (Local Workspace per blueprint — `Feature` and `ToolkitItem` are workspace-local; `Request` and `Task` are Global — matches the blueprint's Object scope split).

```
ToolkitItem
  Id                   uniqueidentifier PK
  WorkspaceId          uniqueidentifier FK → Workspaces (not null)
  Kind                 nvarchar(20)  not null             -- 'Playbook' | 'Plugin' | 'Prompt'
  Name                 nvarchar(200) not null
  Description          nvarchar(2000) null
  OneLiner             nvarchar(300) null                 -- AI-populated in R2; user-editable now
  BodyMarkdown         nvarchar(max) null                 -- for pasted content
  AttachmentBlobPath   nvarchar(400) null                 -- for uploaded content
  LastModifiedAt       datetime2     not null
  LastModifiedBy       uniqueidentifier FK → Users
  [six audit columns]

Unique-filtered index: (WorkspaceId, Name) WHERE IsDeleted = 0.
```

Object registration: adds `'ToolkitItem'` to the `FieldObjectType` union so Field & Object admin (S30) can list it under Objects with Show-in-left-sidebar toggle + Sidebar category = "Reference." Its five system-provisioned fields (Record ID / Name / Date created / Last updated / Created by) are seeded automatically.

### 6. Watchers & alerts — per-record notification preferences (new)

New table `WatcherNotificationPreference` — replaces the current "watch = yes/no" boolean with categorical preferences per (User, Record):

```
WatcherNotificationPreference
  Id                             uniqueidentifier PK
  UserId                         uniqueidentifier FK → Users  (not null)
  RecordId                       uniqueidentifier FK → Requests (not null)
  IsWatching                     bit           not null default 0
  NotifyGateDecisions            bit           not null default 1
  NotifyStatusChanges            bit           not null default 1
  NotifyTaskSignoffs             bit           not null default 1
  NotifySlaAndDueDateReminders   bit           not null default 1
  NotifyMentionsAndComments      bit           not null default 1
  [six audit columns]

Unique-filtered index: (UserId, RecordId) WHERE IsDeleted = 0.
```

The notification fan-out (Event Spine → `NotificationDeliveryService`) reads these before enqueueing. See slice 26.

### 7. `SavedDashboard` — composer extensions

New columns on the existing `SavedDashboard`:

```
IsSeeded         bit          not null default 0     -- seeded dashboards (AI-default, Workload, Feature Catalog, PG-starter) are IsSeeded=1; user dashboards are 0
Visibility       nvarchar(20) not null default 'Shared'   -- 'Shared' | 'Personal'
LayoutMode       nvarchar(20) not null default 'Fixed'    -- 'Fixed' (seeded) | 'Composed' (user-created)
```

Seeded dashboards keep `LayoutMode='Fixed'` — their four-tile / heatmap / grid layout is code, not config. Composed dashboards render from `WidgetLayoutJson` (an ordered list of widget positions + widths). See slice 28.

### 8. Announcement — scheduling extensions

New columns on the existing `Announcement`:

```
ScheduledPublishAt   datetime2 null                          -- when non-null and status='Scheduled', the scheduler flips to 'Published' at this time
AutoArchive          bit       not null default 1            -- toggle on S23 editor (default on)
AutoArchiveAt        datetime2 null                          -- computed = PublishedAt + 30 days when AutoArchive=1
```

Scheduler runs off the existing Event Spine tick (Phase 2 SLA scheduler); no new worker. See §Slice 13 amendments.

### 9. `AuditEntry` — structured columns

The existing `AuditEntry` table carries `EntityType` and `EntityId`. The v2 UI surfaces these as **Object** (mapped from `EntityType`) and **Record ID** (mapped from `EntityId` → `Requests.Prefix + '-' + Requests.Sequence` for Request rows; `EntityId` string otherwise). The projection lives in `usp_QueryWorkspaceAudit` and `usp_QueryFirmWideAudit`; the schema doesn't change.

---

## API deltas (extends `api-contracts.md`)

### Relationships (new)

```
GET    /api/v1/workspaces/{id}/relationships
POST   /api/v1/workspaces/{id}/relationships
GET    /api/v1/relationships/{relationshipId}
PATCH  /api/v1/relationships/{relationshipId}
POST   /api/v1/relationships/{relationshipId}/retire
POST   /api/v1/relationships/{relationshipId}/restore
```

`POST` creates the Relationship + auto-provisions the paired Link-to-record field(s) in one transaction; `PATCH` updates side labels, tab configuration; retire hides the Relationship + its auto-provisioned fields (records with links persist, editor shows retired). Ownership is WorkspaceAdmin. All list responses paginate per the standard envelope.

**Records-side "link a record" API** — powers the Relationships side panel on S4/S5:

```
POST   /api/v1/records/{recordId}/links
DELETE /api/v1/records/{recordId}/links/{linkId}
GET    /api/v1/records/{recordId}/links?relationshipId={rid}
```

Independent of `TypedLink` (existing `related` / `duplicate-of` / `re-pursuit-of` / `sourced-from`) — those stay as slice 10 built them. Relationship-driven links are distinguished by `relationshipId`.

### Request Status/hold (extends `RequestPatchRequest`)

Replace the current sparse `hold: { held: boolean; reason?: string }` on `RequestPatchRequest` with:

```
PATCH /api/v1/requests/{recordId}
Body: { statusHold?: 'InProgress' | 'OnHold' | 'Abandoned', statusHoldNote?: string, ifMatch: string, ... }
```

The API accepts both shapes for one release: if `hold` is sent, it maps to `statusHold` (`hold.held=true` → `OnHold`; `hold.held=false` → `InProgress`). New callers use `statusHold` directly.

**Guarded endpoints** — when `statusHold ∈ {'OnHold', 'Abandoned'}` on the record:
- `POST /api/v1/tasks/{id}/complete` → **409 record-on-hold** (Abandoned is the same code)
- `POST /api/v1/approvals/{id}/decide` → **409 record-on-hold**
- `POST /api/v1/requests/{id}/stage` → **409 record-on-hold**

`ProblemDetails` `detail` is worded per `ux-copy-and-microcopy.md`: "This record is on hold. Reactivate it before completing tasks."

### Watchers & alerts (extends `/records/{id}/watchers`)

Extend `PATCH /api/v1/records/{recordId}/watchers/me` to accept per-preference fields:

```
Body: {
  isWatching?: boolean,
  notifyGateDecisions?: boolean,
  notifyStatusChanges?: boolean,
  notifyTaskSignoffs?: boolean,
  notifySlaAndDueDateReminders?: boolean,
  notifyMentionsAndComments?: boolean
}
```

`GET /api/v1/records/{recordId}/watchers` extends the row shape with the five booleans (own row) and returns only counts (aggregate) for other watchers — never their preferences.

### Multi-lifecycle (extends `/workspaces/{id}/lifecycles`)

```
GET    /api/v1/workspaces/{id}/lifecycles
POST   /api/v1/workspaces/{id}/lifecycles          -- create a new lifecycle
PATCH  /api/v1/lifecycles/{lifecycleId}            -- edit stages/gates on an in-flight lifecycle affects only next firing (frozen approver snapshot rule stands)
POST   /api/v1/lifecycles/{lifecycleId}/set-default  -- exactly one default per workspace; server clears the prior default in the same tx
```

**Intake picker.** `POST /api/v1/workspaces/{id}/requests` accepts an optional `lifecycleId` — if omitted, the workspace's default is used. The S3 intake form fetches `/workspaces/{id}/lifecycles` to populate the picker; a single-lifecycle workspace hides the picker entirely.

### Multi-dashboard composer (extends `/dashboards`)

```
POST   /api/v1/workspaces/{id}/dashboards      -- create user-composed dashboard
PATCH  /api/v1/dashboards/{dashboardId}        -- edit metadata + layout JSON
POST   /api/v1/dashboards/{dashboardId}/widgets
PATCH  /api/v1/dashboards/{dashboardId}/widgets/{widgetId}
DELETE /api/v1/dashboards/{dashboardId}/widgets/{widgetId}
```

Widget composer request body:

```
{
  type: WidgetType,                              -- one of the 8-type palette
  metric?: DashboardMetric,                      -- KPI/timeseries only
  groupByDimension?: string,                     -- breakdown/heatmap only
  rowLimit?: number,                             -- records-grid only
  width: 'Half' | 'Full',
  dept?: string | null,                          -- scope filter
  stage?: string | null                          -- scope filter
}
```

Seeded dashboards (AI-default, Workload, Feature Catalog, PG-starter, Dashboard-viewer surface) remain read-only on the composer path — `PATCH /dashboards/{seededId}` returns **403 seeded-dashboard-read-only**.

### Toolkit (new)

```
GET    /api/v1/workspaces/{id}/toolkit
POST   /api/v1/workspaces/{id}/toolkit
GET    /api/v1/toolkit/{itemId}
PATCH  /api/v1/toolkit/{itemId}
POST   /api/v1/toolkit/{itemId}/retire
POST   /api/v1/toolkit/{itemId}/restore
GET    /api/v1/toolkit/{itemId}/attachment      -- download the uploaded item file
```

Access is Viewer+ within the workspace; a Dashboard-viewer bound to a Toolkit dashboard (unlikely — Toolkit is a reference surface, not a dashboard subject) has no read scope on Toolkit rows.

### Object registry (extends `/workspaces/{id}/objects`)

The S30 Objects tab requires an object-listing endpoint:

```
GET  /api/v1/workspaces/{id}/objects
POST /api/v1/workspaces/{id}/objects         -- create a workspace-local object (Feature-like; blocked for Global scope)
PATCH /api/v1/objects/{objectId}             -- Show-in-left-sidebar + Sidebar category for custom; built-ins locked
```

Request + Task are Global (`scope='Global'`); Feature + ToolkitItem are Local (`scope='Workspace'`); the endpoint returns both bands. The Platform `/api/v1/platform/objects` endpoint returns only the Global set — Request + Task.

### Grouped settings routing note

Not an API change — the web app's route table changes from a flat `/admin/:page` to `/settings/workspace/:page` + `/settings/platform/:page`. All existing admin API endpoints keep their paths; only the client router shifts. The platform routes gate on the platform-admin claim (returns S40 no-access if the claim is absent).

---

## Module deltas (extends `module-boundaries.md`)

### Modules affected

| Module | Change |
|---|---|
| **Fields & Objects** (module 3) | Owns Relationship definitions + Link-to-record type config. Auto-provisions the paired `FieldDefinition` rows on Relationship create. New shape: `RelationshipsService` + `RelationshipsController`. |
| **Requests** (module 5) | Owns `StatusHold` column. `RequestsService.PatchAsync` gates task-completion, gate-decision, and stage-transition on the hold state. |
| **Tasks** (module 7) | Reads hold state from `Requests` — the parent record's hold blocks child task completion. |
| **Approvals** (module 8) | Reads hold state on the record — a held record cannot advance approvals. |
| **Lifecycle & Gates** (module 4) | Manages multi-lifecycle per workspace + default marker. Stage-transition proc reads `lifecycleId` off the record. |
| **Dashboards** (module 15) | Adds widget composer endpoints + `Composed` layout mode. Seeded dashboards keep their fixed layout. |
| **Watchers** (module 12) | Owns per-preference `WatcherNotificationPreference` table. The Notifications module reads preferences before fan-out (module 12 → module 13 boundary is unchanged; the preference table sits inside Watchers, the *query* happens in the Notifications delivery path). |
| **Announcements** (module 13) | Adds `ScheduledPublishAt` + `AutoArchive`. The scheduler runs off the existing Phase 2 SLA/tick worker. |
| **Audit** (module 21) | Adds `objectLabel` + `recordDisplayId` to the query projection. No new module. |
| **Import/Export** (module 17) | UI polish only — no module change. |
| **Toolkit** (new — module 26) | New vertical module owning `ToolkitItem` schema, `usp_QueryToolkit` / `usp_UpsertToolkitItem` / `usp_RetireToolkitItem`, `ToolkitService`, `ToolkitController`, and the S43 web surface. Reference-local scope; access is Viewer+ within the workspace. |
| **Relationships** (new — module 27) | New vertical module owning `Relationship` schema, `usp_UpsertRelationship` / `usp_RetireRelationship`, `RelationshipsService`, `RelationshipsController`, and the S30 Relationships tab UI. Depends on Fields & Objects (auto-provisions Link-to-record fields). |
| **Platform & Shell** (module 1) | Router change to grouped settings surface. Sidebar nav restructures Admin → Workspace / Platform groups. Platform routes guard on the platform-admin claim. |

### Module count

The R1 architecture ships 22 modules; v2 adds **Toolkit** and **Relationships** as 23 and 24. Total is 24 modules — within the ceiling. Dependency graph gets two new leaf nodes; both depend on Fields & Objects and Platform & Shell only. Toolkit additionally depends on Attachments (module 11) for the paste-or-upload path. No cycles introduced.

---

## Shared-types deltas (extends `shared-types.md`)

### New files under `/shared/types/`

- **`relationships.ts`** — `RelationshipDto`, `RelationshipCardinality`, `RelationshipCreateRequest`, `RelationshipPatchRequest`, `RelationshipLinkDto`, `RelationshipLinkCreateRequest`.
- **`toolkit.ts`** — `ToolkitItemDto`, `ToolkitItemKind`, `ToolkitItemListRow`, `ToolkitItemCreateRequest`, `ToolkitItemPatchRequest`.

### Modifications to existing files (**flagged as locked-signature changes**)

- **`fields.ts`** — `FieldObjectType` gains `'ToolkitItem'`; `FieldDefinitionDto` gains `isSystemProvisioned`, `targetObjectType`, `allowMultiple`, `reverseLinkLabel`, `relationshipId` (all optional/nullable — backward compatible for existing callers). `FieldDefinitionUpsertRequest` gains the same four Link-to-record config fields.
- **`requests.ts`** — `RequestDto` gains `statusHold: 'InProgress' | 'OnHold' | 'Abandoned'` and `statusHoldNote?: string`. Existing `hold?: { held: boolean; reason?: string }` is retained as a derived read (server-computed from `statusHold`) for one release; new writers use `statusHold`. `RequestPatchRequest` gains the same two fields. New `RequestListRow.statusHold` column so the S2 list can show the pill.
- **`collaboration.ts`** — `WatcherListItemDto` (already present) gains the five preference booleans. New `WatcherPreferencesPatchRequest`.
- **`dashboards.ts`** — `SavedDashboardDto` gains `visibility: 'Shared' | 'Personal'`, `layoutMode: 'Fixed' | 'Composed'`, `isSeeded: boolean`. New `DashboardComposeRequest`, `WidgetComposeRequest`. Existing seeded dashboard fetch shape is unchanged.
- **`announcements.ts`** — `AnnouncementDto` gains `scheduledPublishAt?: IsoDateTime`, `autoArchive: boolean`, `autoArchiveAt?: IsoDateTime`. `AnnouncementCreateRequest` + patch shape gain the same.
- **`audit.ts`** — `AuditLogRowDto` gains `objectLabel: string` and `recordDisplayId: string | null`. Existing rows without a resolvable Record ID render `objectLabel = 'Configuration'` and `recordDisplayId = null`.
- **`gates.ts`** — no changes. Multi-lifecycle picker at intake writes `lifecycleId` on the create request; the `LifecycleConfigDto` shape already supports multi-per-workspace.
- **`common.ts`** — new branded id `RelationshipId`; new branded id `ToolkitItemId`. Firm error codes extend: `record-on-hold`, `record-abandoned`, `seeded-dashboard-read-only`, `relationship-inconsistent-cardinality`, `relationship-retired-blocks-link`.

Every locked-signature change above is **additive** — no field is removed and no type is narrowed. Existing consumers compile without change. Where an old shape (`RequestDto.hold`) is retained as derived, this is called out on the field's JSDoc.

### Barrel

`/shared/types/index.ts` gains two lines:

```
export * from './relationships';
export * from './toolkit';
```

---

## Dependency-graph deltas (extends `dependency-graph.md`)

Two new modules join the graph:

- **Relationships (27)** depends on **Fields & Objects (3)** and **Platform & Shell (1)**.
- **Toolkit (26)** depends on **Fields & Objects (3)**, **Attachments (11)**, and **Platform & Shell (1)**.

Both are leaves — no downstream module depends on them. No cycles introduced. The topological ordering places both after Slice 3 (Fields & Objects schema engine); slice 25 (Relationships) precedes slice 29 (Toolkit) so the ToolkitItem object type is registered against the Relationships-aware schema engine on first pass.

---

## Shared-inventory deltas (extends `shared-inventory.md`)

### New shared components

- **`RelationshipsSidePanel`** (web) — the S4/S5 side-panel Relationships list; renders one section per relationship + inline "Link a record" action + count. Consumers: Slice 25.
- **`GenericRelatedRecordsTab`** (web) — the config-driven relationship tab (title · linked rows · empty state · inline "New ___"). One implementation drives Tasks & gates, Attachments, and any future relationship-driven tab. Consumers: Slice 25.
- **`StatusHoldPill`** (web) — the tri-state pill shown on S2 rows + S4/S5 header + Home cards. Reuses existing badge tokens. Consumers: Slice 26.
- **`WidgetComposer`** (web) — the S6 side-sheet composer that reads the widget-type catalog and emits `WidgetComposeRequest`. Consumers: Slice 28.
- **`DashboardSwitcher`** (web) — the title-dropdown Shared/Personal + New dashboard control. Consumers: Slice 28.
- **`ToolkitSurface`** (web) — the S43 shell (search · list/gallery toggle · New item · edit-in-place). Reuses the shared list-surface pattern. Consumers: Slice 29.
- **`LifecyclePicker`** (web) — the S3 intake picker + the S31 admin dropdown selector. Both bind to `/workspaces/{id}/lifecycles`. Consumers: Slice 27.

### New shared utilities

- **`useRelationshipTabs(recordId)`** hook — reads Relationships definitions for the record's object, resolves which render as tabs, and returns them in insertion order.
- **`useHoldGuard(recordId)`** hook — pulls `statusHold` off the loaded record and exposes a `guarded(action, message)` wrapper for buttons that must respect the hold; the wrapper shows the disabled state + tooltip and doesn't fire the action.
- **`WidgetTypeCatalog`** module (`web/src/shared/dashboards/`) — the single source of truth for widget types (KPI / breakdown / pipeline / table + their required config fields). Used by both the composer and the renderer.

None of these replace existing shared components; they compose alongside `SidePanel`, `TabBar`, `SavedViewRail`, and `DashboardSurface`.

---

## Slice-plan deltas (extends `slice-plan.md`)

Five new slices — **25 through 29** — appended after Slice 24. The current target is 24 slices; extending to 29 puts us at **1.7×** the 17 top-level user capabilities (still within the 1–3× guidance from `slicing.md`). The drift cap of 25% (30 slices) is not breached.

The slice entries live in `slice-plan.md` — this addendum names them for reviewer context:

- **Slice 25 — Object-level Relationships + Link-to-record field type + config-driven detail tabs + system-provisioned fields.** ~6,000 LoC (at the ceiling). New Relationships module + Fields & Objects extensions + S4/S5 tab-bar rewrite + S30 Relationships tab.
- **Slice 26 — Record Status/hold model + Status tab + per-record notification preferences.** ~3,500 LoC. Migration + guarded procs + S4 Status tab + Watchers & alerts tab UI.
- **Slice 27 — Multiple lifecycles + Lifecycle picker at intake.** ~3,000 LoC. Lifecycle default + intake picker + S31 dropdown selector.
- **Slice 28 — Multi-dashboard composer (S6 upgrade).** ~5,500 LoC. Dashboard-shell rework + widget composer + new endpoints. Seeded dashboards keep fixed layout.
- **Slice 29 — Toolkit object + S43 surface.** ~4,500 LoC. New object, new module, S43 shell + New item / edit-in-place / gallery.

Total after Slice 29: **29 slices**. Six slices below drift cap.

### Amendments to existing slices (in-plan follow-ups)

These are not new slices — they are polish items against surfaces slices already own. The impacted slices' notes carry the "v2 polish" list:

- **Slice 13 (Announcements)** — v2 polish: `ScheduledPublishAt` + `AutoArchive` columns + S23 editor fields + scheduler wiring off the SLA tick.
- **Slice 16 (CSV Import & Export)** — v2 polish: Import wizard UI (target object · drop CSV · auto-map · per-column overrides · Skip · row count · Import rows). No API change.
- **Slice 18/19 (Views & dashboards admin + workspace audit / Platform admin)** — v2 polish: structured `Object` + `Record ID` columns on the audit list. Projection extension in `usp_QueryWorkspaceAudit` + `usp_QueryFirmWideAudit`; UI columns added.
- **Slice 2 (Auth & app shell)** — v2 polish: grouped Workspace/Platform settings IA, secondary side-nav layout, `/settings/workspace/:page` + `/settings/platform/:page` router. Platform-route guard on the platform-admin claim.
- **Slice 17 / 18 / 19** — carrying the router change from Slice 2's polish through the affected admin surfaces (route paths change; component structure is unchanged).

Each polish item is picked up either by whoever next touches the surface, or as a small dedicated PR against the affected slice. Nothing is left to a "final polish" catch-all slice — this document is the contract for what has to land, and it lives alongside the slice docs.

---

## Cross-cutting v2 decisions

- **Prototype is authoritative for prototyped screens.** Per `.claude/rules/design/README.md`, the prototype at `artifacts/docs/design/project/AI Solutions Tracker.dc.html` is the visual truth for S1–S6, S9–S11, S23, S28–S36, S38, S39, S43. The build spec still governs behaviors not settled by the prototype.
- **Team-only approver-slot model stands as the spec** — the reconciliation open question (blueprint open question 2) is resolved in favor of team-only slots as codified by the prototype. The build spec §7.2 "team OR named-individual" is superseded for R1. If a named-individual model is later required, it re-opens as a Release 2 scope item.
- **S37 Role-label catalog: pending open question 4** — the v2 prototype absorbed workspace-scoped role labels into Users & access → Approver teams. A separate platform Role-label catalog is not rendered. Existing slice 19 `POST/GET/PATCH/DELETE /platform/role-labels` remains functional (procs and endpoints stayed intact); the S37 surface is left as `[deferred]` in slice 19's coverage. **If open question 4 confirms S37 is fully absorbed, slice 19's S37 web surface can be removed in a small cleanup PR. Nothing in v2 slices depends on it.**
- **No hard delete floor stands.** Every new object added by v2 (Relationship, ToolkitItem) uses soft-delete + retire semantics per `database-coding-standards.md`. Relationships that are retired continue to hold historical links; retirement hides the definition and its auto-provisioned fields from the editor but does not delete link rows.
- **Access-scope floor stands.** New endpoints follow the `403-not-404` rule from `api-error-handling.md`. Toolkit items belong to their workspace and never leak across workspace boundaries. The Relationships definitions are workspace-owned; cross-workspace relationships are not modeled (would breach the "no second linked path" floor from BS §6.1).
- **PII floor stands.** No new field carries PII beyond what's already logged as `oid`. Toolkit item bodies, Relationship labels, and hold notes are content — treated as Confidential per the requirements Section 4 rule.

---

## Reviewer checklist

Before signing off on v2 architecture, verify:

- [ ] The five new slices (25–29) each map to a distinct user capability from the v2 blueprint's Change Log.
- [ ] Every locked-signature extension in `shared-types.md` is additive (nothing removed, no type narrowed).
- [ ] No cycle introduced by the two new modules (Relationships depends on Fields & Objects; Toolkit depends on Fields & Objects + Attachments).
- [ ] The `hold` → `statusHold` migration path preserves in-flight state (existing `Hold=1` rows become `OnHold`).
- [ ] The Relationships auto-provisioned Link-to-record fields are surfaced under a locked "Relationships" section on the Fields tab (per S30's prototype behavior).
- [ ] Seeded dashboards remain read-only on the composer path (PATCH returns 403 seeded-dashboard-read-only).
- [ ] The grouped settings IA guards platform routes on the platform-admin claim.
- [ ] The team-only slot decision + the S37-deferred posture is captured in the slice log.

---

## Change log

| Date | Author | Section(s) | What changed & why |
|---|---|---|---|
| 2026-07-16 | `/dev-build-architecture` (v2 reconciliation) | All | Initial addendum. Extends the 24-slice architecture with five new slices (25–29) plus four in-plan slice amendments (13/16/18/19/2) to reflect the v2 prototype reconciliation. No existing slice's shipped scope is invalidated; all changes are additive. |

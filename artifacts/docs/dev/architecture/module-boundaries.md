# Module Boundaries — AI Solutions Tracker

*What each module owns, what it exposes to others, and what it deliberately doesn't know. Modules are the units of ownership; slices (see `slice-plan.md`) cross modules and ship user-visible capabilities.*

## Layer boundaries

The monorepo has three areas, each with its own `CLAUDE.md`:

- **`web/`** — React 19 + TypeScript 5 SPA (per `web/CLAUDE.md`)
- **`api/`** — ASP.NET Core API + Worker (per `api/CLAUDE.md`)
- **`database/`** — Azure SQL schema + stored procedures + tSQLt tests (per `database/CLAUDE.md`)

Shared types live at `/shared/types/` and are consumed by both `web/` and `api/` (per project-root rules).

**Layer rules:**
- Web calls API via HTTP only; no direct database access.
- API is the single writer to the database (via EF Core for single-table CRUD, stored procedures for anything else — `database-coding-standards.md`).
- Worker consumes Service Bus messages; API publishes them. Never the reverse.
- Web is the only reader of the frontend build outputs; no server-side rendering.

## Module inventory

Below, each module owns its slice of business logic and exposes a public surface. **Nothing outside a module reaches inside it.** Module boundaries hold across areas — e.g., the "Escalation" module has server logic (`api/Escalation/`), database procs (`database/procedures/escalation/`), and web surfaces (`web/src/features/escalation/`), but they all present a coherent boundary to callers.

### 1. Platform & shell

Owns: workspaces, prefix registry, platform-defined field schema, seed data, health endpoint, SSO integration.

- **Web exposes:** app shell (sidebar, top bar, workspace switcher, theme toggle, account menu), auth guards.
- **API exposes:** `GET /health`, `GET /api/v1/users/me`, workspace CRUD, `EnsureUserMiddleware`, AFD header validation.
- **Database owns:** `Workspaces`, `Users`, `WorkspaceMembership`, `PrefixRegistry`, `PlatformField`, `PlatformAdminGrant`, `UserGroup`.
- **Does not know:** anything domain-specific (Requests, Features, gates). Only knows identity and workspace context.

### 2. Fields & Objects (schema engine)

Owns: the metadata engine — field definitions, per-stage visibility, condition engine, derived fields (Calculation, Derived-category), field library.

- **Web exposes:** Fields & objects admin surface (S30), form-rendering utilities that read field definitions.
- **API exposes:** field CRUD, condition-engine evaluation, field library CRUD for task-typed fields.
- **Database owns:** `FieldDefinition`, `FieldRule`, `DerivedField`, `SelectOption`, `FieldRuleDependency`.
- **Provides:** to Request module — the field schema Requests are built on. To Task module — the field library task-level typed fields draw from. To Escalation module — the identity of crossing fields.
- **Does not know:** what specific fields Requests use; it's a schema engine.

### 3. Lifecycle & Gates

Owns: stage definitions, gate definitions, approver-slot configuration (team-only per prototype), Approver Team membership, role-label references.

- **Web exposes:** Lifecycle & gates admin surface (S31 — prototyped).
- **API exposes:** lifecycle CRUD, gate CRUD, approver-team membership CRUD.
- **Database owns:** `StageDefinition`, `GateDefinition`, `GateApproverSlot`, `ApproverTeamMembership`.
- **Provides:** to Request module — the stages a Request moves through. To Approval module — the slot definitions that get frozen at gate-open.
- **Does not know:** which Requests are in which stage. Doesn't know about approvals in flight.

### 4. Requests (core object)

Owns: the Request record itself, lifecycle-state transitions (stage moves, hold flag, closure), record detail composition.

- **Web exposes:** Requests list (S2), Record detail (S4/S5), Intake form (S3), Drafts (S26).
- **API exposes:** `POST /requests`, `POST /requests/query`, `GET/PATCH/POST /requests/{id}`, `/hold`, `/stage`, `/close`.
- **Database owns:** `Requests`, `Drafts`, `RequestCrossingSnapshot`.
- **Depends on:** Fields & Objects (schema), Lifecycle & Gates (stages), Platform (workspace).
- **Provides:** to Tasks — the parent Request identity. To Escalation — the source record. To Feature Catalog — a source Request for `sourced-from` links.

### 5. Tasks

Owns: child Task records under Requests, typed-field capture, task bundles, phase grouping, precondition rules.

- **Web exposes:** Tasks & gates tab on Record detail (part of S4/S5), Task detail (S25).
- **API exposes:** `POST /requests/{id}/tasks`, `PATCH /tasks/{id}`, `POST /tasks/{id}/promote-to-request`, task-bundle template endpoints.
- **Database owns:** `Tasks`, `TaskBundleTemplate`.
- **Depends on:** Requests (parent), Fields & Objects (field library for typed values), condition engine (preconditions).
- **Does not know:** about gates (gates live on Requests, rendered alongside tasks but different objects).

### 6. Approvals (gates in flight)

Owns: ApprovalRequest lifecycle — opening (freezing slots), collecting decisions, resolving, rejection with required comment, re-request approval flow.

- **Web exposes:** inline approve/reject on Record detail Tasks & gates tab, Home "Needs your decision" panel item.
- **API exposes:** `POST /approval-requests/{id}/decisions`, `POST /approval-requests/{id}/re-request`, `POST /approval-requests/{id}/proxy-decision`.
- **Database owns:** `ApprovalRequests`, `ApprovalDecisions`.
- **Depends on:** Lifecycle & Gates (frozen slot snapshot at open), Requests (advance on all-approved).
- **Provides:** to Notifications — "Sign-off requested" and "Gate decided" events. To Audit — signer + slot + comment context.

### 7. Escalation

Owns: the one-time, one-way bridge — snapshot mapped crossing fields, adopt shared ID on the AI-side row, lock PG-side crossing fields, write the AI Solutions Status mirror off the event spine.

- **Web exposes:** Escalate modal (S18), Escalated record variant (S5) with inline crossed-field markers + mirror note + status pill.
- **API exposes:** `POST /requests/{id}/escalate`. Reads `CrossingMap` at execution time.
- **Database owns:** the second `Requests` row created on the AI Solutions workspace with the shared `RecordId`, plus `RequestCrossingSnapshot` for the snapshotted original values.
- **Depends on:** Requests (source and target rows), Fields & Objects (mapped field identities), Crossing Map (the actual mapping), Attachments (files carry across).
- **Provides:** `AI Solutions Status` writes to the platform-defined field on the PG-side row via the event spine — no manual write path anywhere. Emits `escalation.opened` and `escalation.closed` events.
- **Does not know:** who is in the seeded AI Intake user group; Notifications module fans the event to it.

### 8. Feature Catalog

Owns: Feature records (AI Solutions workspace only), feature list/detail, Add to catalog flow, publish/deprecate.

- **Web exposes:** Feature catalog list (S9), Feature detail (S10), Feature gallery (S11), Feature dashboard (S12), Add-to-catalog (S13).
- **API exposes:** `/features/*` endpoints.
- **Database owns:** `Features` table (§18 field set).
- **Depends on:** Requests (Add to catalog reads a shipped Request), Attachments (visuals).
- **Provides:** the `sourced-from` typed link stamps on submit. Nothing crosses the bridge — features are hub-only.

### 9. Announcements

Owns: Announcement records, publish/retire lifecycle, pinned-strip logic, bell fan-out.

- **Web exposes:** Announcement detail (S21), Announcements list (S22), Manage announcements (S23), the Home pinned strip, the bell menu Announcement history.
- **API exposes:** `/announcements/*`.
- **Database owns:** `Announcements` table (§20 field set).
- **Depends on:** WorkspaceMembership (for audience resolution — "everyone/role-scoped/named users").
- **Provides:** the `announcement.posted` event to Notifications.

### 10. Attachments

Owns: file upload, download, external link, size/type validation, streaming to Blob.

- **Web exposes:** Attachments card on Record detail side panel; drop zone on Intake form.
- **API exposes:** `/attachments/*`, streaming upload endpoints per record.
- **Database owns:** `Attachments` table.
- **Depends on:** Azure Blob Storage (authenticated via Managed Identity).
- **Provides:** files-follow-the-record semantics (BS §2.3). Never mediated by the crossing map.

### 11. Watchers

Owns: per-record subscriptions.

- **Web exposes:** Watch toggle on Record detail side panel.
- **API exposes:** `POST/DELETE /records/{id}/watchers`.
- **Database owns:** `Watchers` table (live per-record subscription — not a crossing field).
- **Provides:** watcher list to Notifications module for fan-out.

### 12. Comments & Activity Thread

Owns: immutable comment posting, activity thread composition (interleaves comments + audit events).

- **Web exposes:** comment composer + activity thread on Record detail Activity tab (Activity content is out of scope in the prototype but the tab exists).
- **API exposes:** `POST /records/{id}/comments`, `GET /records/{id}/thread`.
- **Database owns:** `Comments` table.
- **Depends on:** Audit (thread reads events); Notifications ("Mentioned in a comment" event).

### 13. Typed Links (relationships)

Owns: `related` / `duplicate-of` / `re-pursuit-of` / `sourced-from` link records and side-panel rendering (labeled "Relationships" per prototype).

- **Web exposes:** Relationships card on Record detail side panel; "Link a record" action.
- **API exposes:** `POST /records/{id}/links`, `DELETE /links/{id}`.
- **Database owns:** `TypedLinks` table.
- **Depends on:** Requests / Features / Tasks / Announcements (link target records).

### 14. Saved Views

Owns: view definitions (columns, filters, sort), personal vs shared scope, default-view semantics, the field-level boundary rule for Dashboard-viewers.

- **Web exposes:** Saved-view picker on every list; Saved-view editor side sheet (S24).
- **API exposes:** `/saved-views/*`.
- **Database owns:** `SavedView` table.
- **Depends on:** Fields & Objects (columns must be real fields).
- **Guarantees:** presentation-only — never widens access (`web-testing.md` covers the access-boundary tests).

### 15. Dashboards

Owns: dashboard definitions, the 8-widget palette, seeded fixed layouts (R1 Phase 2), drill-through. **Built (slice 23).**

- **Web exposes:** three seeded dashboards (S6 prototyped, S14, S12) + PG starter dash (S15) + Dashboard viewer surface (S16) + Dashboards list (S17) + S32 shared-dashboards management (carried from slice 18). One generic `DashboardSurface`/`WidgetRenderer` powers all of them.
- **API exposes:** `GET /workspaces/{id}/dashboards` (list), `GET /dashboards/{id}?drill=` (widgets resolved per viewer), `PATCH /dashboards/{id}` (S32 audience/retire, WorkspaceAdmin).
- **Database owns:** `SavedDashboard` table. Layout is a `WidgetsJson` list on the row; the API resolves each widget via a **fixed metric-resolver map** keyed by `config.metric` (no generic query engine in R1). Access via workspace membership OR a bound `WorkspaceMembership.BoundDashboardId` (S16 Dashboard-viewer, drill suppressed). The provisioning clone (`usp_ProvisionWorkspace`) stamps template dashboards into new PG workspaces (§10.5 locality).
- **Depends on:** Saved Views (dashboards embed a records-grid saved view), all widget-source modules for metric queries (Requests, Features, Approvals, Escalation crossing-snapshot, Audit).
- **R1 constraint:** fixed layouts only. No-code builder is Release 2.

### 16. Notifications & Bell

Owns: the bell centre, notification fan-out from the event spine, per-user unread state.

- **Web exposes:** the top-bar bell, its popover with Notifications + Announcement-history entries.
- **API exposes:** `/notifications/*`, mark-read endpoints.
- **Database owns:** `Notifications` table (per-user delivery log).
- **Depends on:** Events (spine). Reads Watchers, ApproverTeamMembership, UserGroupMembership to determine fan-out targets.
- **R1 channel:** in-app only. Email + digests are Release 2 (`api/CLAUDE.md`).
- **Slice 12 fan-out mechanism.** The consumer runs **in-process** on the event spine (`NotificationFanoutConsumer` → `usp_FanOutNotification`), registered alongside `AuditWriter` — so the full cycle works on the LocalDB/no-Azure dev stack. The Worker/Service-Bus path stays the documented production mechanism but is a **no-op when the namespace is unset** (same pattern as slice 9's derived mirror, slice 11's config-selected blob). Targets are the reliably user-resolvable ones only: **Watchers**, **mentioned users** (`comment.posted` payload), **approver-team eligible members** (`gate.opened`), and the **AI Intake group** (`escalation.opened`). Requestor / Business Owner are text field values in Phase 1 (not user references) so they are **not** targeted — this matches the "Reads Watchers / teams / group membership" line above and is not a divergence. The AI Intake group is seeded empty (slice 1), so `escalation-received` fans to zero until members are added (slice 17) — event handled, roster empty, exactly like slice 8's approver roster.

### 17. Search

Owns: workspace-scoped full-text search across fields, comments, and attachment filenames; the top-bar records-only quick search.

- **Web exposes:** top-bar workspace search + Search results (S27).
- **API exposes:** `/search` and `/search/full`.
- **Database owns:** the SQL Server full-text catalog + a maintained index (via triggers or a scheduled ETL — decided during scaffold slice).
- **Depends on:** every content module (Requests, Comments, Attachments' filenames). Reads through views that filter by access.

### 18. Import / Export

Owns: CSV import (create-only), export current view, per-row validation report, Requestor resolution with fallback.

- **Web exposes:** Import & export admin surface (S28), Export view buttons on every items list.
- **API exposes:** `/imports/csv`, `/imports/{id}`, `/exports`.
- **Worker owns:** the import processor (long-running, uses Service Bus for scheduling per `api-worker.md`).
- **Database owns:** `Imports` (job state), `ImportRow` (per-row report).
- **Depends on:** Requests, Fields & Objects, Prefix Registry (mint IDs), Users (Requestor SSO resolution).
- **Business rule:** never updates live records (BS §13). No per-record notifications during import.

### 19. Audit

Owns: append-only audit trail, activity thread event feed, workspace and firm-wide audit log surfaces.

- **Web exposes:** Workspace audit log (S33), Firm-wide audit log (S39).
- **API exposes:** `/audit/query`, `/audit/firm/query`.
- **Database owns:** `AuditEntry` table with INSTEAD OF triggers blocking UPDATE/DELETE at every access level.
- **Depends on:** Events (spine — every meaningful state change produces an AuditEntry).
- **Guarantee:** never rewritten, never deleted, at any access level (including Platform admin — BS §4.3).

### 20. Event spine

Owns: the single emission layer. Every meaningful state change emits exactly one typed event; four consumers read it — Audit, AI Solutions Status mirror, Notifications, Dashboards.

- **API owns:** the in-process emitter interface (`IEventSpine.Emit(EventEnvelope)`) plus the Service Bus transport for cross-service events.
- **Worker owns:** the consumers that need out-of-process handling (mirror updates on the PG-side row, notification fan-out that requires enumerating watchers/teams).
- **Database owns:** no dedicated table — events flow to AuditEntry (as a durable record), Notifications (as delivery log), and mirror updates (as writes to the platform-defined `AI Solutions Status` column).
- **Rule:** every source module calls `IEventSpine.Emit` once per state change. **Never emits twice.** Consumers are pluggable; adding a consumer never requires touching a source module.
- **Slice 12 realisation.** `EventSpine.EmitAsync` now runs its in-process consumers in order — `IAuditWriter` (durable row first) then `INotificationFanout` (`usp_FanOutNotification`) — before the Service-Bus publish (a no-op in dev). Both run on the caller's `DbContext`/transaction, so the audit row, the notification rows, and the state change commit atomically. Adding the notifications consumer touched only the spine's own composition (one shared file + DI), never a source module — honouring the pluggable-consumer rule.

### 21. Platform Admin

Owns: firm-wide config surfaces — platform field schema, crossing map, access provisioning, role-label catalog, workspace provisioning, firm-wide audit.

- **Web exposes:** the six S34-S39 surfaces.
- **API exposes:** `/platform/*` endpoints, gated on `IsPlatformAdmin`.
- **Database owns:** `PlatformField`, `CrossingMap`, `RoleLabelCatalog`, `PlatformAdminGrant`. Reads across all workspaces.

### 22. Error / empty edge states (shared UI)

Owns: no-access page (S40), empty list state (S41), filtered-to-zero state (S42).

- **Web exposes:** the three shared components.
- **API exposes:** nothing — these are pure UI surfaces triggered by API response codes.
- **Rule:** the no-access page never reveals record existence (BS §22.6). Filtered-to-zero uses bordered card treatment, not the pale-fill zero-data pattern.

## Cross-module dependencies

See [`dependency-graph.md`](dependency-graph.md) for the full graph and the acyclicity check.

## What each module does NOT own

To make the boundary tests explicit:

- **Requests** doesn't own: field definitions (Fields & Objects), gate configuration (Lifecycle & Gates), the bridge (Escalation), or in-flight approvals (Approvals).
- **Escalation** doesn't own: notification fan-out (that's Notifications reading the event spine), Approver Team membership (Lifecycle & Gates), or the crossing map's admin surface (Platform Admin owns the propose/confirm flow; Escalation just reads the finalized mappings at execution time).
- **Approvals** doesn't own: gate definitions (Lifecycle & Gates). It freezes a snapshot of those definitions at open and never touches the live definitions again.
- **Feature Catalog** doesn't own: workspaces (Platform), attachments (Attachments). It's a records object with typed links only.
- **Notifications** doesn't own: event emission (Event Spine). It's a consumer.
- **Audit** doesn't own: event emission. It's a consumer. It never mutates its own history.
- **Saved Views / Dashboards** don't own: any data. They're presentation over the underlying modules and resolve to the viewer's entitlements at read time.
- **Search** doesn't own: content. It maintains an index over Requests / Comments / Attachment filenames and reads through access-filtered views.
- **Import / Export** doesn't own: any live records — it creates new records only and reads through access-filtered exports.

## Shared modules (implementation ownership at `/shared/` and area shared folders)

See [`shared-inventory.md`](shared-inventory.md) for the full inventory. High-level:

- **`/shared/types/`** — TypeScript types both `web/` and `api/` consume.
- **`web/src/shared/`** — components (button, input, table shell, side sheet, popover, modal, toast, badge, saved-view picker, empty-state components), hooks (usePersistedReducer, useEventSubscription), utilities (idb.ts, http client, formatters), the app shell + auth guards.
- **`api/Shared/`** — cross-cutting middleware (OperationId, EnsureUser, AFD lockdown, exception handler), Serilog config, error mapping, event spine, cancellation-token helpers, Blob and Service Bus clients (Managed Identity).
- **`database/shared/`** — shared schemas (audit columns fragment, soft-delete filter helper), the ID-mint stored procedure, the event-emission SP.

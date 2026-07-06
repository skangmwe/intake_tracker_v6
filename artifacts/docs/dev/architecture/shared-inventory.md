# Shared Inventory

*Cross-cutting utilities, UI primitives, and infra helpers. Every entry names its interface, location, and slices that will consume it. Nothing here is per-slice; if it belongs to one module, it goes in that module's folder.*

## Scaffold-status legend

- **Status: scaffolded** — folder + placeholder file(s) present after `/dev-build-scaffold` (2026-07-03). Interface signatures may be defined; no feature logic yet.
- **Status: middleware live** — wired into the ASP.NET pipeline for scaffold; real behaviour still per its slice.
- **Status: interface only** — types + signatures defined; no implementation.
- **Status: deferred** — will be scaffolded when the first slice that needs it starts.

Per-concern on-disk locations are listed inline below.

## Slice 1 (Foundation) — implemented

The following cross-cutting items moved from *scaffolded* → **implemented** in slice 1:

- **`event-spine`** — `NoopEventSpine` replaced by `EventSpine` (`api/Api/Shared/EventSpine/EventSpine.cs`). On emit it runs its in-process consumers in order — (1) `AuditWriter` writes the append-only audit row, (2) `NotificationFanout` materialises per-user bell rows (slice 12) — both on the caller's transaction, then (3) publishes the envelope to Service Bus for the remaining cross-service consumers. Registered `Scoped`.
- **`notification-fanout`** — `INotificationFanout` / `NotificationFanout` (`api/Api/Shared/EventSpine/`, slice 12). Parameterized `EXEC usp_FanOutNotification`; the in-process Notifications consumer registered next to `AuditWriter`. A no-op for non-notifiable events. Registered `Scoped`.
- **`service-bus-client`** — `ServiceBusPublisher` (`api/Api/Shared/Messaging/`) implemented over the Azure SDK with `DefaultAzureCredential`; no-ops when `ServiceBus:Namespace` is unset (local/dev). Registered `Singleton`. Config: `ServiceBusOptions` (non-secret).
- **`serilog-config`** — `SerilogConfig.ConfigureSerilog(builder)` wires Console + (conditional) Application Insights sinks with `Enrich.FromLogContext`.
- **`soft-delete-filter`** — `GlobalFilters.ApplySoftDeleteFilter(ModelBuilder)` (`api/Api/Data/GlobalFilters.cs`) applies `WHERE IsDeleted = 0` to every `ISoftDeletable` entity.
- **`datetime-utc`** — `SystemClock : IClock` registered `Singleton`.
- **`record-id-mint`** — `usp_MintRecordId` (`database/procedures/system/`).
- **`audit-emit`** — `usp_EmitAuditEntry` (`database/procedures/audit/`).
- **`usp_ResolveOrigin`** — `database/procedures/system/usp_ResolveOrigin.sql` (prefix → workspace Origin).

New shared items added in slice 1 (not previously catalogued):

- **`app-dbcontext`** — `AppDbContext` (`api/Api/Data/AppDbContext.cs`). EF Core `DbContext` for the foundation entities; single-table CRUD only (joins/aggregations go through stored procedures). Registered `Scoped`.
- **`audit-writer`** — `IAuditWriter` / `AuditWriter` (`api/Api/Shared/EventSpine/`). Parameterized `EXEC usp_EmitAuditEntry`; the seam that keeps `EventSpine` unit-testable. Registered `Scoped`.
- **`service-bus-publisher-abstraction`** — `IServiceBusPublisher` (`api/Api/Shared/Messaging/`). Seam over `ServiceBusPublisher` for the same reason.

## Slice 2 (Auth & app shell) — implemented

Cross-cutting items that moved from *scaffolded/interface-only* → **implemented** in slice 2:

- **`access-guard` / current-user** — `ICurrentUser` / `CurrentUser` (`api/Api/Shared/Auth/CurrentUser.cs`) resolves the Entra `oid`/name/email from JWT claims (v1 + v2 forms). Registered `Scoped`. (The workspace/ownership guard methods of `AccessGuard` remain for the slices that need them.)
- **`ensure-user-middleware`** — real per-replica-cached best-effort upsert, calling **`IUserProvisioner`** / `UserProvisioner` (`api/Api/Shared/Auth/UserProvisioner.cs`, `Scoped`) → `usp_UpsertUser`. The provisioner is the unit-test seam.
- **`error-mapper`** — `GlobalExceptionHandler : IExceptionHandler` (`api/Api/Shared/Errors/`) now maps unhandled exceptions to 500 problem+json with `operationId`, no stack traces, in every environment.
- **`csp-headers-middleware` + `cache-control-defaults`** — live in the pipeline (moved before `UseAuthentication` so short-circuited 401/403 keep the headers).
- **Auth wiring** — `AuthenticationSetup` (`AddAppAuthentication` / `AddSpaCors`): Entra JWT bearer via `Microsoft.Identity.Web`, or the config-gated `DevBypassAuthHandler` (dev). Fallback "must be authenticated" policy; `[AllowAnonymous]` on `/health` only.

New web shared items added in slice 2:

- **Runtime config** — `web/src/config.ts` (`appConfig`, derived `authMode`).
- **`app-insights-client`** — `web/src/shared/appInsights.ts` now inits the real SDK (no-op without a connection string).
- **`http-client`** — `apiClient.ts` gains `setAuthTokenProvider` (bearer attach) + fixed strict-mode typing.
- **Auth abstraction** — `web/src/shared/auth/` (`AuthProvider` MSAL+dev, `useAuth`, `msalConfig`, `initialsOf`).
- **Query client** — `web/src/shared/queryClient.ts`.
- **Theme** — `web/src/shared/theme/` (`theme.ts`, `useTheme.ts`) + server sync via `web/src/features/users/` (`useMe`, `useUpdateTheme`).
- **Hooks** — `web/src/shared/hooks/` (`useDismissable`, `useFocusTrap`).
- **UI primitives** — `Button/IconButton`, `Feedback/LoadingScreen`, and `Layout/` (`AppShell`, `Sidebar`, `TopBar`, `NavItem`, `Lockup`, `WorkspaceSwitcher`, `ThemeToggle`, `AccountMenu`, `BellMenu`, `WorkspaceSearch`, `navItems`).
- **Design-system CSS** — the McDermott `_ds` token + component CSS ported to `web/src/mws/` (`styles.css` aggregator, `tokens/`, `components/`, `tokens.css` override seam, `app-shell.css`). Imported once from `App.tsx`. `/mws/` is exempt from the design-conformance token scan.
- **Test helper** — `web/src/test-utils.tsx` (`renderWithProviders`, `buildMe`, `buildMembership`, `buildAuth`).

## Slice 3 (Fields & objects) — implemented

Cross-cutting items that moved from *placeholder* → **implemented** in slice 3:

- **`condition-engine-eval`** — real `ConditionEngine` (`api/Api/Shared/Rules/ConditionEngine.cs`). `Evaluate(rule, fieldValues)` for show/hide/require/produce-value conditions, and `ValidateGraph(edges)` for the acyclic + depth ≤ 3 check (§3.1). **Slice 21:** takes `IClock`; `Today()` + a `@today`/`@now`/`@currentDate` compare-value token (§3.1 current-date reference, date-aware comparisons) and the `DateDifferenceDays(from,to)` primitive (§3.3). Registered `Singleton`.
- **`access-guard`** — real `IAccessGuard` / `AccessGuard` (`api/Api/Shared/Auth/AccessGuard.cs`). `HasWorkspaceLevelAsync(userId, workspaceId, minLevel)` + `IsPlatformAdminAsync(userId)`, reading `WorkspaceMembership` / `PlatformAdminGrant` via single-table EF. Returns booleans (403 is expected control flow, not an exception); controllers map false → 403 (never 404). Registered `Scoped`.

New shared items added in slice 3:

- **`Button`** — `web/src/shared/components/Button/Button.tsx` (`data-ds="btn"`, primary/secondary/destructive variants, `mws-btn--sm` compact). Joins the existing `IconButton`.
- **`withQuery`** — `web/src/shared/http/url.ts`. The single query-string builder (web-coding-standards.md — never assemble query strings in feature files). Consumed by the fields feature; available to every feature.
- **`buildFieldDefinition` / `buildPlatformField`** — fixtures added to `web/src/test-utils.tsx`.
- **`crypto.randomUUID`** + a stub added to `web/src/setupTests.ts` (jsdom lacks it).

## Cross-cutting utilities

### `error-mapper`
- **Interface:** `mapErrorToProblemDetails(exception, context) → ProblemDetails`
- **Location:** `api/Shared/Errors/ErrorMapper.cs`
- **Consumers:** every controller (registered as the single `UseExceptionHandler` handler). Emits RFC 7807 with `errors` extension for validation failures, an `operationId` extension, and never exposes stack traces or internal exception messages (`api-error-handling.md`).

### `validation-result`
- **Interface:** `ValidationResult` — `{ isValid, errors: Dictionary<string, string[]> }`; `Validate<T>(dto) → ValidationResult`
- **Location:** `api/Shared/Validation/`
- **Consumers:** every controller. Data Annotations first, manual for cross-field + business rules (`api-validation.md`).

### `problem-response`
- **Interface:** `ProblemResponse` builder — `.WithCode(ErrorCode).WithDetail(string).AsResponse()` returning an `IActionResult`.
- **Location:** `api/Shared/Errors/`
- **Consumers:** controllers that surface known error codes (`pending-crossing-edits`, `already-escalated`, etc.).

### `operation-id-middleware`
- **Interface:** ASP.NET Core middleware; reads or generates `X-Operation-Id`, pushes to Serilog `LogContext`, echoes on response.
- **Location:** `api/Shared/Middleware/OperationIdMiddleware.cs`
- **Consumers:** the ASP.NET pipeline (first middleware, before auth). Every Worker restores it from the incoming message's `ApplicationProperties` (`api-logging.md`).

### `ensure-user-middleware`
- **Interface:** ASP.NET Core middleware; upserts `Users` on first authenticated request per replica.
- **Location:** `api/Shared/Middleware/EnsureUserMiddleware.cs`
- **Consumers:** the ASP.NET pipeline (after `UseAuthorization`, before `MapControllers`; `api-auth.md`).

### `afd-lockdown-middleware`
- **Interface:** validates `X-Azure-FDID` against configured Front Door ID; rejects with `403` on mismatch.
- **Location:** `api/Shared/Middleware/AfdLockdownMiddleware.cs`
- **Consumers:** ASP.NET pipeline (after OperationId, before `UseAuthentication`). No-op when the config value is unset (dev, local runs).

### `serilog-config`
- **Interface:** `ConfigureSerilog(builder)` — wires Console + Application Insights sinks with required enrichers.
- **Location:** `api/Shared/Logging/`
- **Consumers:** API + Worker startup (`api-logging.md`). Never logs user content, AI responses, or direct PII per `api-pii-handling.md`. Structured `UserId` (Entra `oid`) + `OperationId` on every entry.

### `event-spine`
- **Interface:** `IEventSpine` — `Emit(EventEnvelope) → Task`. Single emission layer; four consumers read (Audit, Mirror, Notifications, Dashboards).
- **Location:** `api/Shared/EventSpine/` (in-process transport for same-request emits; Service Bus for cross-service consumers).
- **Consumers:** every state-changing module. **Never emits twice** for one state change (BS §11.1).

### `service-bus-client`
- **Interface:** `ServiceBusPublisher` and `ServiceBusConsumer` — thin wrappers around Azure SDK clients, both authenticated via `DefaultAzureCredential`.
- **Location:** `api/Shared/Messaging/`
- **Consumers:** Event Spine (publish), Worker (consume), Import module (schedule long-running import jobs). Peek-lock only (`api-worker.md`).

### `blob-client`
- **Interface (slice 11):** `IBlobStreamer` — `UploadAsync(blobPath, stream, contentType, ct)`, `DownloadAsync(blobPath, ct) → Task<Stream>`, `DeleteAsync(blobPath, ct)`. Two impls, selected in `Program.cs` by config: `AzureBlobStreamer` (Azure.Storage.Blobs + `DefaultAzureCredential`) when `Storage:BlobAccountUri` is set; `LocalBlobStreamer` (filesystem, path-traversal-guarded) otherwise — so the LocalDB / no-Azure dev/test stack runs the full attachment cycle (same no-op-when-config-empty pattern as the Service-Bus publisher).
- **Location:** `api/Shared/Storage/` (`BlobStreamer.cs` = interface + Azure impl, `LocalBlobStreamer.cs`, `StorageOptions.cs`).
- **Consumers:** Attachments module. Streams directly to/from Blob — never buffers the full file in memory (`api-blob-attachments.md`). SQL is the source of truth for the pointer; access is never derived from the path (enforced in the access-gated procs).

### `key-vault-secrets`
- **Interface:** Injected `IOptions<TSecrets>` for each named secret group; loaded at startup via `DefaultAzureCredential` + Azure.Extensions.AspNetCore.Configuration.Secrets.
- **Location:** `api/Shared/Secrets/`
- **Consumers:** any module that needs a third-party secret (Release 2 Anthropic / OpenAI keys, when applicable). Refresh interval: 1 hour default (`api-secrets.md`).

### `cancellation-token-propagation`
- **Interface:** convention (not code) — every async method accepts a `CancellationToken` and passes it down. Enforced by review.
- **Consumers:** everything (`api-coding-standards.md`).

### `soft-delete-filter`
- **Interface:** EF Core global query filter — `modelBuilder.Entity<T>().HasQueryFilter(x => !x.IsDeleted)` on every soft-deletable entity.
- **Location:** `api/DbContext/GlobalFilters.cs`
- **Consumers:** every entity. Soft-deleted rows excluded by default across all queries (`database-coding-standards.md`).

### `record-id-mint`
- **Interface:** SQL stored procedure `usp_MintRecordId(@WorkspaceId) → @RecordId NVARCHAR(20)`. Atomically increments the workspace's `NextSequence` and returns `PREFIX-NNNNNNNN`.
- **Location:** `database/procedures/system/usp_MintRecordId.sql`
- **Consumers:** POST /requests · POST /features · POST /announcements · POST /tasks · POST /workspaces/{id}/imports/csv (per row). **Called on every mint — in-app and CSV concurrent path share the same counter** (BS §6.7).

### `audit-emit`
- **Interface:** SQL stored procedure `usp_EmitAuditEntry(@WorkspaceId, @RecordId, @EventType, @Payload) → …`. Append-only.
- **Location:** `database/procedures/audit/usp_EmitAuditEntry.sql`
- **Consumers:** the Audit consumer of the event spine.

### `datetime-utc`
- **Interface:** `TimeProvider` from BCL (or `IClock` wrapper). Never `DateTime.UtcNow` directly (testability).
- **Location:** `api/Shared/Time/`
- **Consumers:** every module that reads or writes a timestamp.

### `csp-headers-middleware`
- **Interface:** ASP.NET middleware that sets baseline security headers on every response; relaxed CSP on `/swagger/*` per `api-performance.md`.
- **Location:** `api/Shared/Middleware/SecurityHeadersMiddleware.cs`
- **Consumers:** ASP.NET pipeline (early).

### `cache-control-defaults`
- **Interface:** middleware that sets `Cache-Control: private, no-store` on every authenticated response by default; endpoints opt out for genuinely public reference data.
- **Location:** `api/Shared/Middleware/CacheControlMiddleware.cs`
- **Consumers:** ASP.NET pipeline. Prevents AFD from serving one user's data to another (`api-coding-standards.md`).

## Web utilities

### `http-client`
- **Interface:** wrapped `fetch` with typed request/response, ETag support, ProblemDetails parsing, auth token attachment.
- **Location:** `web/src/shared/http/apiClient.ts`
- **Consumers:** TanStack Query hooks in every feature (`web-state-management.md`).

### `use-persisted-reducer` (hook)
- **Interface:** `usePersistedReducer(reducer, initialState, key) → [state, dispatch]`; persists to IndexedDB via `web/src/shared/idb.ts`.
- **Location:** `web/src/shared/hooks/usePersistedReducer.ts`
- **Consumers:** anywhere client-side state needs to survive a refresh (draft persistence, saved-view scratchpad, per-user layout preferences). Per `web-persistence.md` — IndexedDB is the primary store; `localStorage` is reserved for theme preference only.

### `idb`
- **Interface:** low-level IndexedDB helpers — `openStore`, `put`, `get`, `delete`.
- **Location:** `web/src/shared/idb.ts`
- **Consumers:** `usePersistedReducer`, drafts feature.

### `error-boundary`
- **Interface:** React error boundary — catches rendering failures, calls `appInsights.trackException()`, shows a fallback UI.
- **Location:** `web/src/shared/ErrorBoundary.tsx`
- **Consumers:** wraps every route + every feature root (`web-error-logging.md`).

### `app-insights-client`
- **Interface:** singleton `appInsights.trackException(err, props)`, `.trackEvent(name, props)`, `.trackPageView(name)`.
- **Location:** `web/src/shared/appInsights.ts`
- **Consumers:** ErrorBoundary + explicit tracking in modules. Never logs user content or PII.

### `deploy-recovery`
- **Interface:** background poller of `/version.json`; on ID mismatch reloads at next `visibilitychange → hidden`. Global `unhandledrejection` / `error` listeners detect stale-chunk errors and reload once per session.
- **Location:** `web/src/shared/deployRecovery.ts`
- **Consumers:** initialized at app root (`web-deploy-recovery.md`).

### `theme-init` (inline script)
- **Interface:** inline `<script>` in `<head>` of `index.html` that reads `localStorage.theme-preference` and sets the theme before first paint.
- **Location:** `web/public/index.html`
- **Consumers:** everyone — prevents flash of wrong color scheme.

## Web UI primitives (design-system components)

Every primitive follows the McDermott design system (`.claude/rules/design/_core-requirements.md`). Naming conventions come from the design system.

Every design-system component sets `data-ds="<type>"` on its root element per `web-styling.md` — this is what `/dev-review-and-remediate`'s design-fidelity gate uses to pair a built component with its prototype counterpart.

### Buttons
- `Button` (`data-ds="btn"`), `IconButton`, `ButtonGroup`. Variants: primary, secondary, ghost, destructive.
- **Location:** `web/src/shared/components/Button/`
- **Consumers:** every surface.

### Form inputs
- `TextField` (`data-ds="input"`), `TextArea`, `NumberField`, `DateField`, `Select`, `MultiSelect`, `Checkbox`, `Radio`, `Toggle`, `SegmentedControl`.
- **Location:** `web/src/shared/components/Form/`
- **Consumers:** Intake form (S3), Fields & objects admin (S30), Saved-view editor (S24), every editable surface.

### Table / list
- `TableShell` (`data-ds="table"`) — the sticky-header, in-list scroll, resizable-column primitive.
- `SavedViewPicker` (`data-ds="saved-view-picker"`).
- `ViewBar` — container for saved-view picker + active-filter pills + primary action.
- `FilterFunnel` — per-column filter popover, type-aware.
- **Location:** `web/src/shared/components/Table/`
- **Consumers:** Requests list (S2), Feature Catalog list (S9), Toolkit list (R2), Announcements list (S22), audit logs (S33/S39), Dashboard records-grid widget.

### Layout
- `AppShell` — sidebar + top bar + main content region.
- `Sidebar` — collapsible 72px rail with grouped nav sections.
- `TopBar` — workspace search + bell + theme toggle + avatar.
- `SidePanel` — right rail of small cards on the record detail.
- `PageHeader` — page title + optional Pin-as-home + optional breadcrumb.
- **Location:** `web/src/shared/components/Layout/`
- **Consumers:** every prototyped screen with the app shell.

### Disclosure surfaces
- `Modal`, `SideSheet`, `Popover`, `Dropdown`, `Toast`, `Banner`, `InlineAlert`.
- **Location:** `web/src/shared/components/Disclosure/`
- **Consumers:** Escalate modal (S18), Copy modal (S19), Saved-view editor (S24), notification bell (S20 popover), toast confirmations.

### Feedback & state
- `StatusPill`, `BadgeChip` (`data-ds="badge"`), `Stepper` (`data-ds="stepper"`) — the record's lifecycle stepper, `Tabs` (`data-ds="tab"`), `EmptyState`, `Skeleton`, `Spinner`, `AgingTint` (util for row background).
- **Location:** `web/src/shared/components/Feedback/`
- **Consumers:** Record detail (S4/S5) stepper + status pills, list surfaces (aging tint, empty state, skeleton loading), gates on record (approve/reject buttons with status pills).

### Edge states (S40 / S41 / S42) — built in slice 20
- `NoAccessPage` — S40. Full-page pale surface, "Go to Home" CTA. Never reveals existence (no id/title/"not found"); rendered on any 403. Props: `resourceNoun` (default "record"), `homeTo`, `onGoHome`. `data-ds="no-access"`.
- `EmptyListZeroData` — S41. Pale-fill new-user ceremony (navy text, theme-stable). Props: `title`, `message`, `action?`, `icon?`. `data-ds="empty-zero"`.
- `EmptyListFilteredToZero` — S42. Bordered card (`--bg-surface`, never pale), "Clear filters" secondary CTA. Props: `onClearFilters`, `title?`, `message?`, `clearLabel?`. `data-ds="empty-filtered"`.
- **Location:** `web/src/shared/components/EdgeStates/` (consume the shared `.mws-empty` design-system classes; the zero/no-access variants force navy body text per the theme-stable rule).
- **Consumers wired (slice 20):** lists — Requests (S2), Feature catalog (S9), Announcements (S22), Workspace audit (S33), Firm-wide audit (S39); detail routes — Record (S4/S5), Feature (S10), Announcement (S21). Dashboards' embedded grid arrives with dashboards (slice 23).

### Icons
- Phosphor React icons — regular weight only. Sizes 16 / 20 / 24 / 32 / 48 (no in-between per `iconography.md`).
- **Location:** referenced via `@phosphor-icons/react`; add via `web-dependency-security.md` audit gate.
- **Consumers:** everywhere.

## Infra helpers (API)

### `pagination-helper`
- **Interface:** `Paginate<T>(query, request) → PaginatedResponse<T>` — applies page/pageSize with hard max 100 (`api/CLAUDE.md`).
- **Location:** `api/Shared/Query/Pagination.cs`

### `sparse-patch-binder`
- **Interface:** binds a PATCH DTO to an existing entity by mapping only non-null (or explicitly-present) properties.
- **Location:** `api/Shared/Query/PatchBinder.cs`
- **Consumers:** PATCH endpoints on Requests, Tasks, Features, Announcements.

### `etag-check`
- **Interface:** `EnsureEtagMatches(entity, ifMatchHeader)` — throws a `Conflict409` when the incoming ETag doesn't match the current entity version.
- **Location:** `api/Shared/Query/ETag.cs`

### `access-guard`
- **Interface:** `RequireWorkspaceMembership(workspaceId, minimumLevel)` + `RequirePlatformAdmin()` + `RequireOwnership(recordId)`.
- **Location:** `api/Shared/Auth/AccessGuard.cs`
- **Consumers:** every controller endpoint. Ownership check returns `403`, never `404` (`api-error-handling.md`).

### `condition-engine-eval`
- **Interface:** `Evaluate(rule, fieldValues) → bool` — evaluates a show/hide/require/produce-value rule against a field-value map. Depth- and cycle-checked at save via `ValidateGraph`. **Slice 21:** `Today()`, current-date compare-value token (`@today`/`@now`/`@currentDate`) with date-aware comparisons (§3.1), and `DateDifferenceDays(from, to) → int?` (§3.3). Constructed with `IClock` (deterministic under test).
- **Location:** `api/Shared/Rules/ConditionEngine.cs`
- **Consumers:** Fields & Objects (per-stage visibility), Tasks (preconditions), Approvals (conditional approvers), form rendering. Current-date + date-diff are the substrate for configurable Calculation/DerivedCategory fields; SLA/time-in-stage compute directly in the Requests service (no engine coupling).

### `crossing-map-reader` (slice 9 — implemented)
- **Interface:** `ICrossingMapReader.GetCrossingFieldsAsync(workspaceId, ct) → CrossingFieldRow[]` — the
  workspace's Request crossing fields ([S]) from `usp_GetCrossingFields`, read off `FieldDefinition`
  (`Category='Crossing'` + `CrossingToFieldKey`). No separate `CrossingMap` table in Phase 1.
- **Location:** `api/Shared/Escalation/CrossingMapReader.cs`
- **Consumers:** Escalation module only.

### `bridge-reader` (slice 9)
- **Interface:** `IBridgeReader.ReadAsync(recordId, userId, ct) → BridgeRow?` — the escalation-bridge
  inputs from `usp_GetBridgeForRecord` (membership-gated caller side + system read of the AI side, since
  the mirror is system-computed). Null when the record is not escalated or not visible to the caller.
- **Location:** `api/Shared/Escalation/BridgeReader.cs`
- **Consumers:** Requests module — composes the DTO `bridge` block on every record read (mirror status is
  derived read-time from the row via `RequestsService.DeriveMirrorStatus`) and enforces the PG-side
  crossing-field lock on `PATCH`. Lives in `Shared/` to avoid a Requests↔Escalation module cycle.

## Infra helpers (Database)

### `AuditColumns` schema fragment
- **Interface:** inline SQL fragment applied by every table's migration — the six audit columns per `database-coding-standards.md`.
- **Location:** `database/shared/audit-columns.sql`

### `SoftDeleteFilter` view template
- **Interface:** the `WHERE IsDeleted = 0` idiom that appears in every stored procedure reading from a soft-deletable table.

### `usp_MintRecordId`, `usp_EmitAuditEntry`, `usp_ResolveOrigin`
- Listed above in Cross-cutting.

## Slice 5 additions (Requests core)

### Web shared components — design-system primitives (`web/src/shared/components/`)
- **Feedback/**: `Stepper` (`data-ds="stepper"`, circles on a continuous track, compact mode),
  `Tabs` (`data-ds="tab"`, roving tabindex, scroll-not-wrap), `StatusPill` (`data-ds="status-pill"`,
  pale fills + navy text), `agingTintClass(slaStatus)` helper.
- **Table/**: `TableShell` (`data-ds="table"`, CSS-grid items-grid — sticky header, in-list scroll,
  drag/keyboard-resizable columns, sort cycle), `ViewBar`, `SavedViewPicker`, `FilterFunnel`
  (type-aware popover). The canonical items-grid used by every future list surface.
- **Form/**: `TextField`, `TextArea`, `NumberField`, `DateField`, `Select`, `RangeSlider` + the
  internal `FieldShell` frame. Field anatomy per `forms-and-input.md`.
- **Consumers:** Requests (S2/S3/S4) now; every later list/form/detail surface.

### Web shared types (`/shared/types/`)
- **`drafts.ts`** — `DraftDto` / `DraftListRow` / `DraftSaveRequest` / `DraftBody` (S26).
- **`requests.ts`** — `RequestDto` extended with `lifecycleId` + `stages: RequestStageRef[]`.

### Database procedures (`database/procedures/requests/`)
- `usp_CreateRequest`, `usp_GetRequestByIdForUser`, `usp_QueryRequests`, `usp_PatchRequest`
  (ETag/RowVer concurrency), `usp_SetRequestStage`, `usp_SetRequestHold`, and the draft procs
  `usp_SaveDraft` / `usp_GetDraftsForUser` / `usp_GetDraftById` / `usp_DeleteDraft`. Reuse
  `usp_MintRecordId` + `usp_ResolveOrigin` (slice 1) and `usp_GetWorkspaceLifecycles` +
  `usp_GetWorkspaceStages` (slice 4) — no duplication.

### Web feature-local (not shared) — `web/src/features/requests/`
- `requestForm.ts`, `RequestFieldControl`, `workspace.ts`, `api.ts`,
  `useRequests.ts`, `useDrafts.ts` — feature-local until a second consumer appears.
- `problemMessage.ts` — **moved to `/shared` in slice 6** (see below); this file now re-exports it.

## Slice 6 additions (Similar-requests nudge + Comments & activity thread)

### API — new Collaboration module (`api/Api/Modules/Comments/`)
- `ICommentsService` / `CommentsService` (`Scoped`) — posts immutable comments and composes the
  interleaved activity thread; resolves the caller's side + gates access via `usp_GetRequestByIdForUser`
  (reused from slice 5), emits one `comment.posted` event carrying the mention ids. `SummariseEvent`
  is a pure, unit-tested helper. `CommentsController` — `POST /records/{id}/comments`, `GET
  /records/{id}/thread`. The similar-requests read is on the **Requests** module (`FindSimilarAsync`)
  since it finds Requests: `GET /workspaces/{id}/requests/similar`.
- Keyless proc projections added to `Data/Entities.cs` + registered in `AppDbContext`:
  `ActivityThreadRow`, `SimilarRequestRow`.

### Database (`database/procedures/comments/`, `database/procedures/requests/`)
- `usp_CreateComment`, `usp_GetActivityThread` (interleave + access gate + twin exclusion),
  `usp_FindSimilarRequests` (LIKE token-overlap; not full-text — LocalDB constraint, slice 15 owns
  full-text). Migration `20260704_032_CreateComments` + `trg_Comments_PreventMutation`.

### Web shared
- **`web/src/shared/text/mentions.ts`** — `parseMentions(text)`, the single @mention tokenizer.
  Consumed by the comment composer now; the slice-12 fan-out later.
- **`web/src/shared/constants.ts`** — `SIMILAR_DEBOUNCE_MS`, `SIMILAR_MIN_QUERY_LENGTH` (the shared
  home for debounce/interval/timeout constants per web-coding-standards.md).
- **`web/src/shared/http/problemMessage.ts`** — extracted here once the comments feature became a
  second consumer; the requests feature's `problemMessage.ts` re-exports it.

### Web feature — `web/src/features/comments/`
- `api.ts` (thread + comment calls, narrows the wire shape to the `ActivityThreadItem` union),
  `useComments.ts` (`useThread` / `usePostComment`), `ActivityTab` (public export — the S4/S5 Activity
  tab: timeline renderer + composer), `activity.css`.
- Requests feature gained `findSimilarRequests` (`api.ts`) + `useSimilarRequests` (`useRequests.ts`)
  and a live `SimilarRequestsPanel` (feature-local inside `IntakeFormPage`).

## Slice 7 additions (Tasks)

### API — new Tasks module (`api/Api/Modules/Tasks/`)
- `ITasksService` / `TasksService` (`Scoped`) — list / create-single / apply-bundle / patch, all
  access-gated through the parent Request on the caller's side (`usp_GetRequestByIdForUser`, reused
  from slice 5) → 403 never 404. Emits one `task.created` / `task.bundle-applied` / `task.updated`
  event per state change (ids only, no PII). `NormalisePhase`, `MapDefinitionTypeToKind`, and
  `ParseBundleTasks` are pure, unit-tested public helpers. `TasksController` — `GET/POST
  /requests/{id}/tasks`, `PATCH /tasks/{id}`, `GET /workspaces/{id}/task-bundles` (Viewer+ via
  `IAccessGuard`). `TaskDtos.cs` mirrors `/shared/types/tasks.ts`.
- Keyless proc projections added to `Data/Entities.cs` + registered in `AppDbContext`: `TaskRow`,
  `TaskBundleTemplateRow`, `TaskFieldRow`.
- Requests list read (`RequestsService.Reads.cs`) projects a `repo` column — the field-as-column
  rollup (`usp_QueryRequests` correlated subquery over the record's first URL-type task field).

### Database (`database/procedures/tasks/`)
- `usp_GetTasksForRequest` (access-gated, open-first/done-sinks ordering), `usp_CreateTask`,
  `usp_ApplyTaskBundle` (OPENJSON expansion, order-preserving), `usp_PatchTask` (sparse `@Set*`
  flags; Done stamps `CompletedAt`), `usp_GetTaskBundleTemplates`, `usp_GetTaskField` (validate a
  captured field belongs to the workspace task library + resolve its label). Migrations
  `20260704_033_CreateTasks`, `_034_CreateTaskBundleTemplate`, `_035_SeedTaskBundleTemplates`.
  `usp_QueryRequests` extended with the `RepoUrl` rollup projection.

### Web feature — `web/src/features/tasks/`
- `api.ts`, `useTasks.ts` (`useTasks` / `useTaskBundles` / `useTaskLibrary` / `useCreateTasks` /
  `usePatchTask`), `TasksTab` (public export — the S4/S5 tasks section), `TaskRow`, `TaskComposer`,
  the pure `taskView.ts` helpers, `tasks.css`. `useTaskLibrary` reuses `fetchTaskLibrary`
  (`@/features/fields/api`). Requests list (`RequestsListPage`) renders the Repo URL rollup cell.

## Slice 8 additions (Gates & approvals)

### API — new Gates module (`api/Api/Modules/Gates/`)
- `IApprovalsService` / `ApprovalsService` (`Scoped`) — `FindGateForTransitionAsync` (is this from→to
  gated?), `OpenGateAsync` (freeze slots + emit `gate.opened`; `AlreadyOpen` → 409), `GetForRecordAsync`
  (record-gated read), `SubmitDecisionAsync` (approve/reject + `isProxy`; emits `gate.decided`, plus
  `request.stage-changed` when a gate resolves + advances), `ReRequestAsync`. `ParseJson<T>` is a pure,
  unit-tested public helper. `ApprovalsController` — `GET /requests/{id}/approval-requests`,
  `POST /approval-requests/{id}/decisions` / `/re-request` / `/proxy-decision`. `ApprovalDtos.cs`
  mirrors `/shared/types/gates.ts`.
- **Registered before Requests** in `Program.cs` — `RequestsService.SetStageAsync` now depends on
  `IApprovalsService` (one-directional): a gated transition opens a gate (`GateOpened` / `GateAlreadyOpen`
  outcomes) instead of advancing. `StageTransitionResultDto` extended to `{ advanced, newStage?, gateOpened? }`
  (null members omitted via `JsonIgnore`).
- Keyless proc projections added to `Data/Entities.cs` + registered in `AppDbContext`:
  `GateForTransitionRow`, `ApprovalRequestRow`.

### Database (`database/procedures/gates/`)
- `vw_ApprovalRequestDetail` (AR + decisions-as-JSON projection — DRY across every gate read/write),
  `usp_GetGateForTransition`, `usp_OpenGate` (freeze eligible members, gate-already-open THROW 50051),
  `usp_GetApprovalRequestsForRecord` (access-gated list), `usp_SubmitDecision` (eligibility +
  reject-needs-comment + supersede + resolve-and-advance; Member+ / WorkspaceAdmin-for-proxy access
  gate), `usp_ReRequestApproval` (supersede a rejection → pending). Migrations
  `20260704_036_CreateApprovalRequests`, `_037_CreateApprovalDecisions`.

### Web feature — `web/src/features/gates/`
- `api.ts`, `useGates.ts` (`useApprovalRequests` / `useSubmitDecision` / `useReRequest`), `GateBlock`
  (public export — the inline gate block), `GateSlot`, the pure `gateView.ts` helpers, `gates.css`.
  `web/src/features/tasks/TaskGroup.tsx` (extracted from `TasksTab`) renders each phase's tasks + gates;
  `TasksTab` merges task phases with gate target phases so a gate renders even in a phase with no tasks.
  `useSetStage` (requests) invalidates the gates query; the Status tab surfaces a gate-opened note.
- Shared test builder added to `web/src/test-utils.tsx`: `buildApprovalRequest`.

## Slice 10 additions (Closure, Copy, Re-pursuit + Typed links)

### API — new Closure module (`api/Api/Modules/Closure/`)
- `IClosureService` / `ClosureService` (`Scoped`) — reads the record on the caller's side via
  `IRequestsService.GetByIdAsync` (403 never 404), requires Member+, writes the outcome into
  `FieldValues` (`usp_CloseRequest`), emits one `request.closed`. `Validate` is a pure, unit-tested
  helper (Duplicate needs a target). `ClosureController` — `POST /requests/{id}/close`.

### API — new TypedLinks module (`api/Api/Modules/TypedLinks/`)
- `ITypedLinksService` / `TypedLinksService` (`Scoped`) — list / add / remove typed links (access gated
  through the FROM record), emits `link.added` / `link.removed`. `ICopyService` / `CopyService`
  (`Scoped`) — copies a record to a fresh Draft in a target workspace (Member+ both sides), strips
  outcome/hold/stage/system keys, queues an optional link-back; has **no DbContext** (composes
  `IRequestsService` + `IDraftsService` + `IAccessGuard`), so it is fully unit-testable.
  `TypedLinksController` — `GET/POST /records/{id}/links`, `DELETE /links/{id}`, `POST /records/{id}/copy`.
- Keyless proc projections added to `Data/Entities.cs` + registered in `AppDbContext`: `TypedLinkRow`,
  `TypedLinkDeleteRow`. Registered **before Tasks** in `Program.cs` (Tasks promote depends on `ICopyService`).

### API — Requests + Tasks changes
- `RequestsService.CreateAsync` now stamps queued link-backs (`BuildQueuedLinksJson`, pure) via
  `usp_CreateRequest @QueuedLinksJson`; `MapRow` builds the `Outcome` block (`MapOutcome`, pure).
  `DraftBodyDto` / `DraftBodyInput` + `usp_SaveDraft` serialization gained `queuedLinks`.
- `TasksService.PromoteToRequestAsync` (depends on `ICopyService`) — reads the task (`usp_GetTaskById`),
  copies the parent to a draft with a queued `related` link, cancels the task. `TasksController` —
  `POST /tasks/{id}/promote-to-request`.

### Database
- New table `TypedLinks` (migration `20260704_038` + rollback). Procs: `usp_CreateTypedLink`,
  `usp_GetTypedLinksForRecord`, `usp_DeleteTypedLink` (`database/procedures/links/`), `usp_CloseRequest`
  (`database/procedures/requests/`), `usp_GetTaskById` (`database/procedures/tasks/`). `usp_CreateRequest`
  gained the optional trailing `@QueuedLinksJson` (best-effort in-transaction stamping).

### Web shared — `shared/components/Disclosure/`
- **`Modal`** (`data-ds="modal"`) — the shared modal primitive (scrim + focus trap + Escape + scrim-click
  + focus restore), extracted once close / link / copy joined escalate as consumers. Escalate keeps its
  own inline modal (surgical scope).

### Web features — `web/src/features/closure/` + `web/src/features/typed-links/`
- `closure`: `api.ts`, `useClose.ts` (`useCloseRecord`), `CloseRecordModal` (public export). `typed-links`:
  `api.ts`, `useTypedLinks.ts` (`useRecordLinks` / `useAddLink` / `useDeleteLink` / `useCopyRecord`),
  `RelationshipsCard` (public export — replaces the Status-tab stub), `LinkRecordModal`, `CopyModal`, the
  `linkKinds.ts` label constants. Record detail's Status tab hosts the Relationships card + Close-record
  action; the Tasks tab hosts a per-task Promote action; `IntakeFormPage` seeds + forwards a resumed
  draft's queued links (Copy / Promote link-back → typed link at submit). `usePromoteTask` added to the
  tasks feature; `buildTypedLink` added to `test-utils.tsx`.

### Slice 15 — Search

- **Web shared util `shared/workspace/activeWorkspace.ts`** — `resolveActiveWorkspaceId(memberships)`,
  **extracted from `features/requests/workspace.ts`** once a third consumer (Search) appeared (Requests,
  Feature Catalog, Search). `features/requests/workspace.ts` is now a one-line re-export, so existing
  requests-feature imports are unchanged. Its test moved to `shared/workspace/activeWorkspace.test.ts`.
- **Web shared hook `shared/hooks/useDebouncedValue.ts`** — generic value-debounce (timer cleared on
  change/unmount). Consumed by the top-bar `WorkspaceSearch`. (`IntakeForm`'s pre-existing inline
  debounce was left as-is — out of scope.)
- **Search constants** added to `shared/constants.ts`: `SEARCH_DEBOUNCE_MS` (300), `SEARCH_MIN_QUERY_LENGTH`
  (3, mirrors the proc token floor), `SEARCH_RESULTS_PAGE_SIZE` (20).
- **Shared types reused (no new types):** `SearchHitDto` / `SearchResultDto` already existed in
  `/shared/types/notifications.ts`.
- **API module `Modules/Search`** — `SearchController` (`GET /search`, `POST /search/full`),
  `SearchService` (raw ADO.NET over `usp_SearchRecords` / `usp_SearchFull`; the full read is two result
  sets), `SearchDtos`. No DbContext entities added (raw reader). Registered in `Program.cs`. References
  `PaginatedResponse<T>` from the Requests module (the shared paginated envelope).
- **Database** (no new tables — reads existing Requests / Comments / Attachments): procs
  `usp_SearchRecords`, `usp_SearchFull` (`database/procedures/search/`); tSQLt `database/tests/search/test_Search.sql`.
  Matching is **LIKE-based token overlap**, not full-text (LocalDB has no Full-Text component — the same
  resolution as slice 6's similar-requests nudge).

### Slice 16 — CSV Import & Export

- **Web shared `shared/http/apiClient.ts`** — added **`apiFetchBlobPost(path, body, signal?)`**: POST a
  JSON body and read the binary response as a Blob (bearer-authenticated), for the CSV export download.
  Complements the existing `apiFetchBlob` (GET).
- **Web shared `shared/http/download.ts` (new)** — **`saveBlob(blob, fileName)`**: transient
  `<a download>` save of a Blob obtained through an authenticated fetch. First consumer is the export;
  attachments keeps its own inline `saveAttachment` (not refactored — surgical scope).
- **Import constant** added to `shared/constants.ts`: `IMPORT_POLL_INTERVAL_MS` (2000) — the S28 status poll.
- **Shared types** — added `ImportStartResponse { importId, status }` to `/shared/types/imports.ts`
  (the `202` body); the rest of `imports.ts` (`ImportStatusDto`, `ImportFlaggedRow`, `ExportRequest`)
  already existed.
- **API `Modules/SavedViews`** — added `ISavedViewsService.GetByIdAsync(savedViewId, ct)` (ungated read
  of a view's definition; the Export service applies its own access gate).
- **API module `Modules/ImportExport`** — `ImportExportController` (`POST /workspaces/{id}/imports/csv`,
  `GET /imports/{id}`, `POST /exports`); `IImportService`/`ImportService` (stream → blob → `usp_CreateImport`
  → enqueue → 202; admin-gated status read); `IImportQueue`/`ImportQueue` (Singleton, in-process
  `Channel`); `ImportProcessor` (hosted `BackgroundService` draining the queue off the request thread);
  `IImportRunner`/`ImportRunner` (Scoped — CsvHelper parse → per-row create via `IRequestsService`);
  `IExportService`/`ExportService` (DbContext-free — composes SavedViews + the access-gated Requests
  query + `IAccessGuard`); pure `CsvRowMapper` / `ImportOutcomeMapper` / `CsvExportWriter`;
  `ImportExportOptions` (`IOptions`, "ImportExport" section). Keyless projections `ImportJobRow` /
  `ImportReportRow` added to `Data/Entities.cs` + `AppDbContext`. All registered in `Program.cs`
  (`ImportProcessor` via `AddHostedService`). **In-process processing** stands in for the
  Worker/Service-Bus path (no Service Bus in dev — slice 9/11/12 precedent). **New NuGet dependency:
  `CsvHelper` 33.1.0** (RFC-4180 parse), verified live on NuGet.
- **Database** — tables `Imports` + `ImportRows` (migrations `20260705_046` / `20260705_047` + rollbacks);
  procs `usp_CreateImport`, `usp_RecordImportRow`, `usp_CompleteImport`, `usp_GetImportById`,
  `usp_GetImportRows` (`database/procedures/imports/`); tSQLt `database/tests/imports/test_Imports.sql`.
  Per-row create reuses `usp_MintRecordId` (shared counter, BS §6.7) via `IRequestsService`.

### Slice 19 — Platform admin (S35 · S36 · S37 · S38 API · S39)

- **Shared types `/shared/types/platform.ts` (new)** — `CrossingMapRowDto`; `RoleLabelDto` +
  `RoleLabel{Create,Rename}Request`; `PrivilegedGrantKind` / `PrivilegedGrantDto` /
  `PrivilegedGrantsListDto` + `PlatformAdminGrantRequest`; `WorkspaceProvisionResult`;
  `FirmWideAuditRowDto` (extends `AuditLogRowDto` + `workspaceName`) + `FirmWideAuditQuery` (extends
  `AuditLogQuery` + optional `workspaceId`). Exported from the barrel. `WorkspaceProvisionRequest`
  reused from `identity.ts`.
- **API `Modules/PlatformAdmin` (extended)** — `CrossingMapService` (`usp_GetCrossingMap`),
  `RoleLabelsService` (list/create/rename/retire + spine events), `AccessGrantsService`
  (list/grant/revoke + events), `FirmWideAuditService` (raw ADO.NET two-result-set read),
  `PlatformProblems` (shared RFC-7807 builders), and controllers `CrossingMapController` /
  `RoleLabelsController` / `AccessController` / `PlatformAuditController` — all gated on
  `IAccessGuard.IsPlatformAdminAsync` (403 never 404). Keyless projections `CrossingMapRow` /
  `PrivilegedGrantRow` / `PlatformAdminGrantResultRow` / `WorkspaceProvisionRow` added to `Data/Entities.cs`
  + `AppDbContext`. Registered in `Program.cs`.
- **API `Modules/Workspaces` (from stub)** — `WorkspaceProvisioningService` (`usp_ProvisionWorkspace`,
  outcome-mapped guards) + `WorkspacesController` (`POST /api/v1/workspaces`, Platform-admin-gated).
- **Database `procedures/platform` (new)** — `usp_GetCrossingMap`, `usp_CreateRoleLabel`,
  `usp_RenameRoleLabel`, `usp_RetireRoleLabel`, `usp_UpsertPlatformAdminGrant`,
  `usp_RevokePlatformAdminGrant`, `usp_ListPrivilegedGrants`, `usp_ProvisionWorkspace`,
  `usp_QueryFirmWideAudit`. **No new tables** — reuses `RoleLabelCatalog` (slice 4), `PlatformAdminGrant`
  (slice 1), `FieldDefinition` crossing fields (slice 3/9), `AuditEntry` (slice 1). tSQLt in
  `tests/platform`.
- **Web `features/platform-admin` (from stub)** — `api.ts`, hooks (`usePlatformAdmin`, `useCrossingMap`,
  `useRoleLabels`, `useAccessGrants`, `useFirmWideAudit`), the `PlatformGate` frame, the four pages
  (`CrossingMapPage` S35, `AccessPage` S36, `RoleLabelsPage` S37, `FirmWideAuditPage` S39) + their
  sub-components, `platformAdmin.css`. Routes + `IMPLEMENTED_ROUTES` in `App.tsx`.
- **Web shared — nav gating.** `NavSection` gained `platformOnly?`; a **Platform** section added to
  `navItems.ts`; `Sidebar` filters it on a new required `isPlatformAdmin` prop threaded from `AppShell`
  (`me?.isPlatformAdmin`).
- **Web shared — audit barrel promotion.** `eventGroup` / `eventTypeLabel` / `EVENT_TYPE_OPTIONS` /
  `EventGroup` promoted from the audit feature's internals to its barrel (`@/features/audit`) for the
  firm-wide table + filter bar.

### Slice 22 — Home surface (S1)

- **Shared types `/shared/types/home.ts` (new)** — `HomeDto` + `HomeDecisionItem` / `HomeWorkItem` /
  `HomeActivityItem` / `HomeTriageItem` / `HomePinnedAnnouncement`. **Replaces** the scaffold's
  placeholder Home types (`HomeDto`/`HomeApprovalItem`/`HomeRecordItem`/`HomeActivityItem`) removed from
  `notifications.ts` (never consumed — slice 22 is the first Home build). Exported from the barrel.
- **`ConditionEngine` (extended)** — `Evaluate` gains an optional `currentUserId` param and resolves the
  `@currentUser` / `@me` compare-side token (§10.7) — the substrate for viewer-scoped saved-view filters.
  Mirrors slice 21's `@today` addition; existing callers unchanged (default null).
- **API `Modules/Home` (new)** — `IHomeService` / `HomeService` (`Scoped`) composes five viewer-scoped
  reads into `HomeDto`; four bind keyless projections via `FromSqlRaw`, the activity read runs raw
  ADO.NET (it returns rows **and** the prior-visit `@SinceLastSeenAt` OUTPUT). `HomeController`
  (`GET /api/v1/home?workspaceId=`, Viewer-gated via `IAccessGuard` → 403 never 404). SLA on the work
  panel reuses `RequestsService.ComputeSla`. Keyless projections `HomeDecisionRow` / `HomeWorkRow` /
  `HomeTriageRow` / `HomePinnedAnnouncementRow` added to `Data/Entities.cs` + `AppDbContext`. Registered
  in `Program.cs`.
- **Database `procedures/home` (new)** — `usp_GetHomeDecisions`, `usp_GetHomeWork`, `usp_GetHomeActivity`
  (owns the `LastHomeSeenAt` read-prev → stamp-now → return-since), `usp_GetHomeTriage`,
  `usp_GetHomePinnedAnnouncements`. Migration 050 adds `Users.LastHomeSeenAt`. No new tables. tSQLt in
  `tests/home`.
- **Web `features/home` (from stub)** — `api.ts` (`fetchHome`), `useHome`, the pure `homeView.ts`
  helpers (relative/waiting/since formatting, due-badge class, activity icon/label — reuses
  `@/features/audit`'s `eventGroup`/`eventTypeLabel`), `HomeView` + the panel components
  (`HomePanel`, `DecisionsPanel`, `WorkPanel`, `ActivityPanel`, `TriagePanel`, `PinnedStrip`,
  `PinAsHomeButton`), `home.css`. `pages/HomePage` now mounts `HomeView` (replacing the slice-2 welcome).
  Reuses `resolveActiveWorkspaceId` (workspace scope) + `EdgeStates` conventions; no new shared util.

## What we're deliberately NOT sharing yet

- **Rich-text editor** — used by comments and rich-text fields; not shared until we hit the second use. If only Comments uses it, it lives in the Comments module.
- **Chart library wrapper** — dashboards use widget-type-specific components; we'll extract only the visual shell after the first three widgets exist.
- **PDF preview / DMS integration** — Release 2.
- **Notification-preference UI** — Release 2 (email + digests).

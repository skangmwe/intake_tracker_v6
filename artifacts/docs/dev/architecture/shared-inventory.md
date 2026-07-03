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

- **`event-spine`** — `NoopEventSpine` replaced by `EventSpine` (`api/Api/Shared/EventSpine/EventSpine.cs`). On emit it (1) writes the append-only audit row synchronously via `AuditWriter` (the same-request Audit consumer) then (2) publishes the envelope to Service Bus for cross-service consumers. Registered `Scoped`.
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
- **Interface:** `BlobStreamer` — `UploadStream(blobPath, stream) → Task<BlobUploadResult>`, `DownloadStream(blobPath) → Task<Stream>`.
- **Location:** `api/Shared/Storage/`
- **Consumers:** Attachments module. Streams directly to/from Blob — never buffers full file in memory (`api-blob-attachments.md`). Managed Identity via `DefaultAzureCredential`.

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

### Edge states (S40 / S41 / S42)
- `NoAccessPage` — S40. Never reveals existence.
- `EmptyListZeroData` — S41. Pale-fill new-user ceremony.
- `EmptyListFilteredToZero` — S42. Bordered card, "Clear filters" secondary CTA.
- **Location:** `web/src/shared/components/EdgeStates/`
- **Consumers:** every list surface (S2, S9, S22, audit logs, dashboards' embedded grid) and every record-detail route.

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
- **Interface:** `Evaluate(rule, fieldValues) → RuleResult` — evaluates a show/hide/require/produce-value rule against a field-value map. Depth- and cycle-checked at save.
- **Location:** `api/Shared/Rules/ConditionEngine.cs`
- **Consumers:** Fields & Objects (per-stage visibility), Tasks (preconditions), Approvals (conditional approvers), form rendering.

### `crossing-map-reader`
- **Interface:** `GetMappingsForEscalation(pgWorkspaceId) → CrossingMap[]`.
- **Location:** `api/Shared/Escalation/CrossingMapReader.cs`
- **Consumers:** Escalation module only.

## Infra helpers (Database)

### `AuditColumns` schema fragment
- **Interface:** inline SQL fragment applied by every table's migration — the six audit columns per `database-coding-standards.md`.
- **Location:** `database/shared/audit-columns.sql`

### `SoftDeleteFilter` view template
- **Interface:** the `WHERE IsDeleted = 0` idiom that appears in every stored procedure reading from a soft-deletable table.

### `usp_MintRecordId`, `usp_EmitAuditEntry`, `usp_ResolveOrigin`
- Listed above in Cross-cutting.

## What we're deliberately NOT sharing yet

- **Rich-text editor** — used by comments and rich-text fields; not shared until we hit the second use. If only Comments uses it, it lives in the Comments module.
- **Chart library wrapper** — dashboards use widget-type-specific components; we'll extract only the visual shell after the first three widgets exist.
- **PDF preview / DMS integration** — Release 2.
- **Notification-preference UI** — Release 2 (email + digests).

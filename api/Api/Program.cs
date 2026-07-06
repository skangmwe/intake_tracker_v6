// AI Solutions Tracker — API entrypoint.
//
// Scaffold state: this Program.cs wires the minimum ASP.NET Core pipeline
// required to serve GET /health end-to-end. Feature slices layer additional
// middleware, controllers, DI registrations, and configuration on top of this
// skeleton. Middleware order below follows api-performance.md verbatim; do not
// re-order without updating the doc first.
//
// The health endpoint is deliberately anonymous and does NOT hit the database
// or any downstream service (api/CLAUDE.md — "no dependencies and no database
// calls — it must always respond, even if downstream services are degraded").

using McDermott.AiTracker.Api.Data;
using McDermott.AiTracker.Api.Modules.Users;
using McDermott.AiTracker.Api.Shared.Auth;
using McDermott.AiTracker.Api.Shared.Errors;
using McDermott.AiTracker.Api.Shared.EventSpine;
using McDermott.AiTracker.Api.Shared.Logging;
using McDermott.AiTracker.Api.Shared.Messaging;
using McDermott.AiTracker.Api.Shared.Middleware;
using McDermott.AiTracker.Api.Shared.Time;
using Microsoft.EntityFrameworkCore;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// Serilog — Console always, Application Insights when configured (api-logging.md).
builder.ConfigureSerilog();

// ─── Services ────────────────────────────────────────────────────────────
builder.Services.AddControllers()
    .AddJsonOptions(opts =>
    {
        // Enum-as-string on the wire (api-coding-standards.md JSON Serialization rule).
        opts.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    });

// ProblemDetails + the single global exception handler (api-error-handling.md).
// GlobalExceptionHandler maps unhandled exceptions to 500 RFC 7807 without ever exposing
// a stack trace or exception message, in every environment.
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

// ─── Auth (api-auth.md) ────────────────────────────────────────────────────
// Entra ID JWT-bearer validation, or the dev bypass when Auth:DevBypass:Enabled is set.
// Registers ICurrentUser + the fallback "must be authenticated" authorization policy.
builder.AddAppAuthentication();
builder.AddSpaCors();

// ─── Data access (EF Core, single-table CRUD — api-data-access.md) ─────────
// Registration is lazy; no connection is opened at startup, so GET /health (which
// touches no database) always responds. The connection string is non-secret for
// local dev (LocalDB, Windows auth); production overrides it with an AAD /
// Managed-Identity connection string via configuration (api-secrets.md).
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("AppDb")));

// ─── Options (non-secret config — api-secrets.md) ──────────────────────────
builder.Services.Configure<ServiceBusOptions>(
    builder.Configuration.GetSection(ServiceBusOptions.SectionName));
builder.Services.Configure<McDermott.AiTracker.Api.Shared.Storage.StorageOptions>(
    builder.Configuration.GetSection(McDermott.AiTracker.Api.Shared.Storage.StorageOptions.SectionName));
builder.Services.Configure<McDermott.AiTracker.Api.Modules.Attachments.AttachmentsOptions>(
    builder.Configuration.GetSection(McDermott.AiTracker.Api.Modules.Attachments.AttachmentsOptions.SectionName));
builder.Services.Configure<McDermott.AiTracker.Api.Modules.ImportExport.ImportExportOptions>(
    builder.Configuration.GetSection(McDermott.AiTracker.Api.Modules.ImportExport.ImportExportOptions.SectionName));

// ─── Shared services (shared-inventory.md) ─────────────────────────────────
builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddSingleton<IServiceBusPublisher, ServiceBusPublisher>();
builder.Services.AddScoped<IAuditWriter, AuditWriter>();
// In-process Notifications consumer of the event spine (slice 12) — materialises bell rows on the
// caller's transaction, next to AuditWriter (module-boundaries §16/§20).
builder.Services.AddScoped<INotificationFanout, NotificationFanout>();
builder.Services.AddScoped<IEventSpine, EventSpine>();

// Blob storage (slice 11) — Azure via Managed Identity when Storage:BlobAccountUri is set;
// filesystem fallback otherwise so the LocalDB / no-Azure dev stack runs the full attachment cycle
// (mirrors the Service-Bus no-op-when-namespace-empty pattern). Both impls are stateless + thread-safe.
var storageOptions = builder.Configuration
    .GetSection(McDermott.AiTracker.Api.Shared.Storage.StorageOptions.SectionName)
    .Get<McDermott.AiTracker.Api.Shared.Storage.StorageOptions>()
    ?? new McDermott.AiTracker.Api.Shared.Storage.StorageOptions();
if (string.IsNullOrWhiteSpace(storageOptions.BlobAccountUri))
{
    builder.Services.AddSingleton<McDermott.AiTracker.Api.Shared.Storage.IBlobStreamer>(
        _ => new McDermott.AiTracker.Api.Shared.Storage.LocalBlobStreamer(storageOptions.LocalRootPath));
}
else
{
    builder.Services.AddSingleton<McDermott.AiTracker.Api.Shared.Storage.IBlobStreamer>(
        _ => McDermott.AiTracker.Api.Shared.Storage.AzureBlobStreamer.Create(
            storageOptions.BlobAccountUri, storageOptions.ContainerName));
}

// ─── Module services (Users — slice 2) ─────────────────────────────────────
builder.Services.AddScoped<McDermott.AiTracker.Api.Shared.Auth.IUserProvisioner,
    McDermott.AiTracker.Api.Shared.Auth.UserProvisioner>();
builder.Services.AddScoped<IUserProfileService, UserProfileService>();

// ─── Users & access admin (slice 17) ────────────────────────────────────────
builder.Services.AddScoped<IMembersService, MembersService>();

// ─── Fields & objects (slice 3) ─────────────────────────────────────────────
builder.Services.AddScoped<McDermott.AiTracker.Api.Shared.Auth.IAccessGuard,
    McDermott.AiTracker.Api.Shared.Auth.AccessGuard>();
builder.Services.AddSingleton<McDermott.AiTracker.Api.Shared.Rules.IConditionEngine,
    McDermott.AiTracker.Api.Shared.Rules.ConditionEngine>();
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.Fields.IFieldSchemaService,
    McDermott.AiTracker.Api.Modules.Fields.FieldSchemaService>();
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.PlatformAdmin.IPlatformFieldService,
    McDermott.AiTracker.Api.Modules.PlatformAdmin.PlatformFieldService>();

// ─── Lifecycle & gates (slice 4) ────────────────────────────────────────────
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.Lifecycle.ILifecycleService,
    McDermott.AiTracker.Api.Modules.Lifecycle.LifecycleService>();

// ─── Gates & approvals (slice 8) — registered before Requests, which depends on it ─
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.Gates.IApprovalsService,
    McDermott.AiTracker.Api.Modules.Gates.ApprovalsService>();

// ─── Escalation bridge readers (slice 9) — registered before Requests, which reads the bridge ─
builder.Services.AddScoped<McDermott.AiTracker.Api.Shared.Escalation.IBridgeReader,
    McDermott.AiTracker.Api.Shared.Escalation.BridgeReader>();
builder.Services.AddScoped<McDermott.AiTracker.Api.Shared.Escalation.ICrossingMapReader,
    McDermott.AiTracker.Api.Shared.Escalation.CrossingMapReader>();

// ─── Requests ───────────────────────────────────────────────────────────────
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.Requests.IRequestsService,
    McDermott.AiTracker.Api.Modules.Requests.RequestsService>();
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.Requests.IDraftsService,
    McDermott.AiTracker.Api.Modules.Requests.DraftsService>();

// ─── Escalation (slice 9) — depends on Requests + the crossing-map reader ─────
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.Escalation.IEscalationService,
    McDermott.AiTracker.Api.Modules.Escalation.EscalationService>();

// ─── Comments & activity thread ───────────────────────────────────────────────
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.Comments.ICommentsService,
    McDermott.AiTracker.Api.Modules.Comments.CommentsService>();

// ─── Typed links + Copy (slice 10) — Copy depends on Requests + Drafts; registered before Tasks,
//     which depends on ICopyService for promote-to-request ─────────────────────────────
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.TypedLinks.ITypedLinksService,
    McDermott.AiTracker.Api.Modules.TypedLinks.TypedLinksService>();
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.TypedLinks.ICopyService,
    McDermott.AiTracker.Api.Modules.TypedLinks.CopyService>();

// ─── Closure (slice 10) — depends on Requests ───────────────────────────────────
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.Closure.IClosureService,
    McDermott.AiTracker.Api.Modules.Closure.ClosureService>();

// ─── Tasks (slice 7; slice 10 adds promote-to-request via ICopyService) ─────────
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.Tasks.ITasksService,
    McDermott.AiTracker.Api.Modules.Tasks.TasksService>();

// ─── Attachments (slice 11) — depends on Requests (record access) + IBlobStreamer ─
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.Attachments.IAttachmentsService,
    McDermott.AiTracker.Api.Modules.Attachments.AttachmentsService>();

// ─── Watchers + Notifications (slice 12) — record subscriptions + the bell centre ─
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.Watchers.IWatchersService,
    McDermott.AiTracker.Api.Modules.Watchers.WatchersService>();
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.Notifications.INotificationsService,
    McDermott.AiTracker.Api.Modules.Notifications.NotificationsService>();

// ─── Announcements (slice 13) — team notices delivered through the bell ─
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.Announcements.IAnnouncementsService,
    McDermott.AiTracker.Api.Modules.Announcements.AnnouncementsService>();

// ─── Feature Catalog + Saved views (slice 14) — Features depends on Requests / Drafts / TypedLinks
//     (all registered above); Saved views is presentation metadata over the list surfaces ─
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.Features.IFeaturesService,
    McDermott.AiTracker.Api.Modules.Features.FeaturesService>();
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.SavedViews.ISavedViewsService,
    McDermott.AiTracker.Api.Modules.SavedViews.SavedViewsService>();

// ─── Search (slice 15) — records-only quick search + the S27 full search. Reads Requests /
//     Comments / Attachments through access-gated procs; owns no state of its own ─
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.Search.ISearchService,
    McDermott.AiTracker.Api.Modules.Search.SearchService>();

// ─── Import / Export (slice 16) — CSV import (create-only) + Export view. Import streams to Blob and
//     hands off to an in-process queue drained by ImportProcessor OFF the request thread (the dev/test
//     stack has no Service Bus — same in-process precedent as slice 12's fan-out; the Worker/Service-Bus
//     path stays the documented production mechanism). Export composes SavedViews + the access-gated
//     Requests query (no DbContext of its own) so it is fully unit-testable. ───
builder.Services.AddSingleton<McDermott.AiTracker.Api.Modules.ImportExport.IImportQueue,
    McDermott.AiTracker.Api.Modules.ImportExport.ImportQueue>();
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.ImportExport.IImportService,
    McDermott.AiTracker.Api.Modules.ImportExport.ImportService>();
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.ImportExport.IImportRunner,
    McDermott.AiTracker.Api.Modules.ImportExport.ImportRunner>();
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.ImportExport.IExportService,
    McDermott.AiTracker.Api.Modules.ImportExport.ExportService>();
builder.Services.AddHostedService<McDermott.AiTracker.Api.Modules.ImportExport.ImportProcessor>();

// ─── Audit (slice 18) — the S33 Workspace audit-log read. Reads the append-only dbo.AuditEntry
//     through usp_QueryWorkspaceAudit; owns no write path (the event spine's AuditWriter, slice 1,
//     is the only writer). WorkspaceAdmin-gated in the controller. ───
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.Audit.IAuditService,
    McDermott.AiTracker.Api.Modules.Audit.AuditService>();

// ─── Platform admin (slice 19) — the S35–S39 firm-wide config surfaces. Every service is gated on
//     the caller's Platform-admin grant in its controller (IsPlatformAdmin → 403 never 404). Reads go
//     through platform-scope procs (crossing map off FieldDefinition, role labels, privileged grants,
//     firm-wide audit); writes emit events onto the spine so config changes land in the firm-wide
//     audit. Workspace provisioning clones the PG/Dept template. ───
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.PlatformAdmin.ICrossingMapService,
    McDermott.AiTracker.Api.Modules.PlatformAdmin.CrossingMapService>();
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.PlatformAdmin.IRoleLabelsService,
    McDermott.AiTracker.Api.Modules.PlatformAdmin.RoleLabelsService>();
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.PlatformAdmin.IAccessGrantsService,
    McDermott.AiTracker.Api.Modules.PlatformAdmin.AccessGrantsService>();
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.PlatformAdmin.IFirmWideAuditService,
    McDermott.AiTracker.Api.Modules.PlatformAdmin.FirmWideAuditService>();
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.Workspaces.IWorkspaceProvisioningService,
    McDermott.AiTracker.Api.Modules.Workspaces.WorkspaceProvisioningService>();

// ─── Home surface (slice 22) — the S1 per-user landing (BS §10.7). Composes five viewer-scoped reads
//     (needs-your-decision / your-work-today / since-you-were-last-here / new-to-triage / pinned
//     announcements) into one payload, scoped to the active workspace and gated on membership. ───
builder.Services.AddScoped<McDermott.AiTracker.Api.Modules.Home.IHomeService,
    McDermott.AiTracker.Api.Modules.Home.HomeService>();

// Swagger is deferred to a later slice that adds Swashbuckle with the pinned
// Microsoft.OpenApi override. Config flag remains so early consumers see the
// intended contract (api-coding-standards.md — Swagger is gated by config, not
// the environment).

var app = builder.Build();

// ─── Middleware pipeline (order per api-performance.md) ────────────────
// 1. Exception handling — wraps the whole pipeline; uses GlobalExceptionHandler.
app.UseExceptionHandler();

// 2. HTTPS redirection — skipped locally; enabled at deployment.

// 3. CORS — env-driven allowed origins (api/CLAUDE.md).
app.UseCors(AuthenticationSetup.CorsPolicyName);

// 4. OperationId middleware (before any logging — api-logging.md).
app.UseMiddleware<OperationIdMiddleware>();

// 5. AFD lockdown (before UseAuthentication so unauth callers that bypassed
//    AFD do not reach token validation — api-auth.md).
app.UseMiddleware<AfdLockdownMiddleware>();

// 6. Security headers + Cache-Control defaults — placed before authentication so their
//    OnStarting callbacks cover short-circuited 401/403 responses too (same rationale as
//    OperationId running before auth). api-performance.md (Security Headers),
//    api-coding-standards.md (Response Caching / AFD lockdown).
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<CacheControlMiddleware>();

// 7. Authentication — Entra JWT bearer, or the dev bypass (api-auth.md).
app.UseAuthentication();

// 8. Authorization — the fallback policy requires an authenticated user everywhere
//    except [AllowAnonymous] endpoints (GET /health).
app.UseAuthorization();

// 9. EnsureUser middleware — after UseAuthorization, before MapControllers. Provisions the
//    caller's row on first authenticated request (api-auth.md).
app.UseMiddleware<EnsureUserMiddleware>();

// Request-completion logging — after OperationId so each entry carries the OperationId
// from LogContext (api-logging.md). Logs method/path/status/duration only — never a body.
app.UseSerilogRequestLogging();

// 10. Endpoints
app.MapControllers();

app.Run();

// Test entry point — allows WebApplicationFactory<Program> in integration tests.
public partial class Program { }
